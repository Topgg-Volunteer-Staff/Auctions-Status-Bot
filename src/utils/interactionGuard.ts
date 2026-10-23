import {
  DiscordAPIError,
  Message,
  MessageFlags,
  MessageFlagsBitField,
  MessageFlagsResolvable,
  RepliableInteraction,
} from 'discord.js'

// Discord drops an interaction that isn't acknowledged within 3 seconds of
// being created, after which every response fails with 10062. We aim to have
// acknowledged by this point, leaving headroom for the defer round trip.
const ACK_TARGET_MS = 2_500
// Never auto-defer sooner than this, so handlers that open modals (which must
// be the first response) always get a fair window even if our clock is skewed.
const MIN_AUTO_DEFER_DELAY_MS = 1_000
const MAX_AUTO_DEFER_DELAY_MS = 2_000

const LOADING_CONTENT = '⏳ Working on it...'
const MODAL_TOO_SLOW_CONTENT = 'That took too long to open. Please try again.'

const UNKNOWN_INTERACTION_CODE = 10062
const ALREADY_ACKNOWLEDGED_CODE = 40060

export const isUnknownInteractionError = (error: unknown): boolean =>
  error instanceof DiscordAPIError &&
  (error.code === UNKNOWN_INTERACTION_CODE ||
    error.code === ALREADY_ACKNOWLEDGED_CODE)

// Time a handler can safely spend before responding with something that
// can't be deferred, like a modal.
export const PRE_MODAL_BUDGET_MS = MIN_AUTO_DEFER_DELAY_MS - 200

/**
 * Resolves with the promise's value, or `timedOut` if it doesn't settle by
 * `deadline` (a Date.now() timestamp). Rejections resolve to null.
 */
export const settleBy = async <T>(
  promise: Promise<T>,
  deadline: number
): Promise<T | null | 'timedOut'> => {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<'timedOut'>((resolve) => {
    timer = setTimeout(
      () => resolve('timedOut'),
      Math.max(0, deadline - Date.now())
    )
  })
  try {
    return await Promise.race([promise.catch(() => null), timeout])
  } finally {
    clearTimeout(timer)
  }
}

type ResponseOptions = Record<string, unknown>
type ResponseMethod = (...args: Array<unknown>) => Promise<unknown>

const toOptions = (payload: unknown): ResponseOptions =>
  typeof payload === 'string'
    ? { content: payload }
    : { ...((payload ?? {}) as ResponseOptions) }

const isEphemeral = (payload: unknown): boolean => {
  const options = toOptions(payload)
  if (options.ephemeral === true) return true
  if (options.flags === undefined || options.flags === null) return false
  return new MessageFlagsBitField(options.flags as MessageFlagsResolvable).has(
    MessageFlags.Ephemeral
  )
}

const withEphemeral = (
  payload: unknown,
  ephemeral: boolean
): ResponseOptions => {
  const options = toOptions(payload)
  delete options.ephemeral
  delete options.withResponse
  delete options.fetchReply
  // Leave flags out entirely when there's nothing to set: sending 0 on an
  // edit would try to clear IsComponentsV2, which Discord rejects.
  if (options.flags === undefined && !ephemeral) return options
  const flags = new MessageFlagsBitField(
    (options.flags ?? 0) as MessageFlagsResolvable
  )
  if (ephemeral) flags.add(MessageFlags.Ephemeral)
  else flags.remove(MessageFlags.Ephemeral)
  options.flags = flags.bitfield
  return options
}

// Edits can't carry the ephemeral flag; visibility is fixed when sent.
const forEdit = (payload: unknown): ResponseOptions =>
  withEphemeral(payload, false)

export interface InteractionGuard {
  // Stops the auto-defer timer and tidies up a "thinking" reply that the
  // handler never filled in. Call once the handler has finished.
  finish(): Promise<void>
}

/**
 * Makes sure the interaction is acknowledged before Discord's 3 second
 * deadline. If the handler hasn't responded in time, the interaction is
 * deferred on its behalf (an ephemeral "thinking" reply for commands/modals,
 * a silent deferUpdate for components), and the handler's later reply/update/
 * deferReply calls are transparently translated into editReply/followUp, so
 * handlers keep working unchanged whether or not the auto-defer kicked in.
 */
export function guardInteraction(
  interaction: RepliableInteraction
): InteractionGuard {
  const target = interaction as unknown as Record<string, unknown>
  const original = (name: string): ResponseMethod => {
    const fn = target[name]
    if (typeof fn !== 'function') {
      return () => Promise.reject(new Error(`${name} is not available`))
    }
    return (fn as ResponseMethod).bind(interaction)
  }

  const orig = {
    reply: original('reply'),
    deferReply: original('deferReply'),
    update: original('update'),
    deferUpdate: original('deferUpdate'),
    showModal: original('showModal'),
    editReply: original('editReply'),
    followUp: original('followUp'),
    deleteReply: original('deleteReply'),
    fetchReply: original('fetchReply'),
  }

  // Components are deferred with deferUpdate so a later `update` can still
  // edit the message the component lives on.
  const mode: 'reply' | 'update' = interaction.isMessageComponent()
    ? 'update'
    : 'reply'

  let state: 'pending' | 'handler' | 'auto' = 'pending'
  let autoAck: Promise<void> = Promise.resolve()
  let respondedAfterAuto = false

  // When the handler wants a reply that the auto-defer can't stand in for
  // (a public reply after an ephemeral defer, or any reply after a
  // deferUpdate), it is sent as a follow-up and later edits target that.
  let emulated: {
    ephemeral: boolean
    placeholder: Message | null
    message: Message | null
  } | null = null

  // Emulated sends must not interleave, or two edits could each send a
  // follow-up.
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn)
    queue = next.catch(() => undefined)
    return next
  }

  const age = Math.max(0, Date.now() - interaction.createdTimestamp)
  const delay = Math.min(
    MAX_AUTO_DEFER_DELAY_MS,
    Math.max(MIN_AUTO_DEFER_DELAY_MS, ACK_TARGET_MS - age)
  )

  const timer = setTimeout(() => {
    if (state !== 'pending' || interaction.deferred || interaction.replied) {
      return
    }
    state = 'auto'
    autoAck = (
      mode === 'update'
        ? orig.deferUpdate()
        : orig.deferReply({ flags: MessageFlags.Ephemeral })
    ).then(
      () => undefined,
      (error) => {
        console.warn('[interactions] Auto-defer failed:', error)
      }
    )
  }, delay)
  timer.unref()

  const startEmulated = (ephemeral: boolean, withPlaceholder: boolean) =>
    serial(async () => {
      if (emulated) return
      emulated = { ephemeral, placeholder: null, message: null }
      // The ephemeral "thinking" reply can't become a public message, so
      // clear it; follow-ups then appear as their own messages.
      if (mode === 'reply') await orig.deleteReply().catch(() => undefined)
      if (withPlaceholder) {
        emulated.placeholder = (await orig.followUp({
          content: LOADING_CONTENT,
          flags: ephemeral ? MessageFlags.Ephemeral : undefined,
        })) as Message
      }
    })

  const sendEmulated = (payload: unknown) =>
    serial(async () => {
      if (!emulated) throw new Error('No emulated reply in progress')
      if (emulated.message) {
        return orig.editReply({
          ...forEdit(payload),
          message: emulated.message,
        })
      }
      // Send fresh rather than editing the placeholder, since a plain
      // placeholder can't be turned into a Components V2 message.
      const message = (await orig.followUp(
        withEphemeral(payload, emulated.ephemeral)
      )) as Message
      emulated.message = message
      const placeholder = emulated.placeholder
      emulated.placeholder = null
      if (placeholder)
        await orig.deleteReply(placeholder).catch(() => undefined)
      return message
    })

  const emulatedTarget = (): Message | undefined =>
    emulated?.message ?? emulated?.placeholder ?? undefined

  // How each handler call is carried out once the auto-defer has happened.
  const afterAutoReply: Record<
    'reply' | 'deferReply' | 'update' | 'deferUpdate' | 'showModal',
    (payload?: unknown) => Promise<unknown>
  > =
    mode === 'reply'
      ? {
          reply: async (payload) => {
            if (isEphemeral(payload)) return orig.editReply(forEdit(payload))
            await startEmulated(false, false)
            return sendEmulated(payload)
          },
          deferReply: async (payload) => {
            if (!isEphemeral(payload)) await startEmulated(false, true)
          },
          update: (payload) => orig.editReply(forEdit(payload)),
          deferUpdate: async () => undefined,
          showModal: () => orig.editReply({ content: MODAL_TOO_SLOW_CONTENT }),
        }
      : {
          reply: async (payload) => {
            await startEmulated(isEphemeral(payload), false)
            return sendEmulated(payload)
          },
          deferReply: (payload) => startEmulated(isEphemeral(payload), true),
          update: (payload) => orig.editReply(forEdit(payload)),
          deferUpdate: async () => undefined,
          showModal: () =>
            orig.followUp({
              content: MODAL_TOO_SLOW_CONTENT,
              flags: MessageFlags.Ephemeral,
            }),
        }

  for (const name of Object.keys(afterAutoReply) as Array<
    keyof typeof afterAutoReply
  >) {
    if (typeof target[name] !== 'function') continue
    target[name] = async (...args: Array<unknown>) => {
      if (state === 'pending') {
        // Claim the response synchronously so the timer can't defer while
        // this call is still in flight.
        state = 'handler'
        clearTimeout(timer)
      }
      if (state === 'handler') return orig[name](...args)
      respondedAfterAuto = true
      await autoAck
      return afterAutoReply[name](args[0])
    }
  }

  target.editReply = async (payload: unknown) => {
    if (state !== 'auto') return orig.editReply(payload)
    respondedAfterAuto = true
    await autoAck
    if (emulated) return sendEmulated(payload)
    return orig.editReply(forEdit(payload))
  }

  target.followUp = async (payload: unknown) => {
    if (state !== 'auto') return orig.followUp(payload)
    respondedAfterAuto = true
    await autoAck
    return orig.followUp(payload)
  }

  target.deleteReply = async (message?: unknown) => {
    if (state !== 'auto') return orig.deleteReply(message)
    respondedAfterAuto = true
    await autoAck
    return orig.deleteReply(message ?? emulatedTarget())
  }

  target.fetchReply = async (message?: unknown) => {
    if (state !== 'auto') return orig.fetchReply(message)
    await autoAck
    return orig.fetchReply(message ?? emulatedTarget())
  }

  return {
    async finish() {
      clearTimeout(timer)
      if (state !== 'auto' || respondedAfterAuto || mode !== 'reply') return
      // The handler finished without responding at all; don't leave the
      // auto-deferred "thinking" message hanging.
      await autoAck
      await orig.deleteReply().catch(() => undefined)
    },
  }
}
