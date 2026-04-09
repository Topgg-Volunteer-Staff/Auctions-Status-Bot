import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Message,
  ThreadChannel,
} from 'discord.js'
import { channelIds, roleIds } from '../../globals'
import {
  loadMongoBackedJson,
  saveMongoBackedJson,
} from '../db/mongoBackedJsonStore'

type TicketPendingReminder = {
  dueAt: number
  messageUrl: string
  responderName: string
}

type DmDeliveryState = 'active' | 'failed'

type TicketDmDeliveryStatus = {
  state: DmDeliveryState
  attemptedAt: number
  reason?: string
}

type TicketDmPreference = {
  openerId: string
  enabled: boolean
  toggleMessageUrl?: string
  awaitingOpenerResponse?: boolean
  pendingReminder?: TicketPendingReminder
  lastDmDeliveryStatus?: TicketDmDeliveryStatus
}

type PersistedTicketDmPreferences = Record<string, TicketDmPreference>

const TICKET_DM_PREFS_STORE_KEY = 'ticket-dm-responses'
const DM_DEBUG_CHANNEL_ID = '396848636081733632'

const STAFF_RESPONSE_REMINDER_DELAY_MS = 5 * 60_000
const DM_QUEUE_SPACING_MS = 1_000
const DM_ISSUE_DEDUPE_WINDOW_MS = 6 * 60 * 60_000
const EXPECTED_DM_DELIVERY_ERROR_CODES = new Set([50007, 50278])
const EXPECTED_DM_DELIVERY_ERROR_PATTERNS = [
  /cannot send messages to this user/i,
  /no mutual guilds/i,
]

const ticketDmPreferences = new Map<string, TicketDmPreference>()
const pendingReminderTimers = new Map<string, NodeJS.Timeout>()
const recentlyReportedDmIssues = new Map<string, number>()

let initPromise: Promise<void> | null = null
let writeChain: Promise<void> = Promise.resolve()
let dmQueue: Promise<void> = Promise.resolve()
let runtimeClient: Client | null = null

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function isStaffMessage(message: Message): Promise<boolean> {
  if (!message.inGuild()) return false

  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null))
  if (!member) return false

  return [
    roleIds.moderator,
    roleIds.reviewer,
    roleIds.trialReviewer,
    roleIds.supportTeam,
  ].some((id) => member.roles.cache.has(id))
}

function isSupportedTicketThread(message: Message): message is Message & {
  channel: ThreadChannel
} {
  const channel = message.channel
  if (!channel.isThread()) return false

  const parentId = channel.parentId
  return (
    parentId === channelIds.modTickets || parentId === channelIds.auctionsTickets
  )
}

function isValidPendingReminder(value: unknown): value is TicketPendingReminder {
  if (!isObject(value)) return false

  return (
    typeof value.dueAt === 'number' &&
    Number.isFinite(value.dueAt) &&
    typeof value.messageUrl === 'string' &&
    value.messageUrl.length > 0 &&
    typeof value.responderName === 'string' &&
    value.responderName.length > 0
  )
}

function normalizeDueAt(value: number): number {
  // Backward-compat: older/manual values may be stored in seconds.
  return value < 1_000_000_000_000 ? value * 1000 : value
}

function normalizePendingReminder(value: unknown): TicketPendingReminder | null {
  if (!isValidPendingReminder(value)) return null

  return {
    dueAt: normalizeDueAt(value.dueAt),
    messageUrl: value.messageUrl,
    responderName: value.responderName,
  }
}

function isValidDeliveryStatus(value: unknown): value is TicketDmDeliveryStatus {
  if (!isObject(value)) return false

  const state = value.state
  if (state !== 'active' && state !== 'failed') return false

  return (
    typeof value.attemptedAt === 'number' &&
    Number.isFinite(value.attemptedAt) &&
    (value.reason === undefined || typeof value.reason === 'string')
  )
}

function normalizeDeliveryStatus(
  value: unknown
): TicketDmDeliveryStatus | null {
  if (!isValidDeliveryStatus(value)) return null

  return {
    state: value.state,
    attemptedAt: normalizeDueAt(value.attemptedAt),
    ...(typeof value.reason === 'string' && value.reason.length > 0
      ? { reason: value.reason }
      : {}),
  }
}

async function writeCurrentStoreToDisk(): Promise<void> {
  const data: PersistedTicketDmPreferences = {}
  for (const [threadId, pref] of ticketDmPreferences.entries()) {
    data[threadId] = pref
  }
  await saveMongoBackedJson(TICKET_DM_PREFS_STORE_KEY, data, {
    operation: 'persist',
  })
}

async function initStore(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      const parsed = await loadMongoBackedJson<unknown>(
        TICKET_DM_PREFS_STORE_KEY,
        {}
      )
      if (!isObject(parsed)) return

      let migrated = false

      for (const [threadId, pref] of Object.entries(parsed)) {
        if (typeof threadId !== 'string' || !isObject(pref)) continue

        const openerId = pref.openerId
        const enabled = pref.enabled
        const toggleMessageUrl = pref.toggleMessageUrl
        if (typeof openerId !== 'string' || typeof enabled !== 'boolean') {
          continue
        }

        const normalizedPendingReminder = normalizePendingReminder(
          pref.pendingReminder
        )
        const normalizedDeliveryStatus = normalizeDeliveryStatus(
          pref.lastDmDeliveryStatus
        )
        const awaitingFromFile =
          typeof pref.awaitingOpenerResponse === 'boolean'
            ? pref.awaitingOpenerResponse
            : false
        const awaitingOpenerResponse = normalizedPendingReminder
          ? true
          : awaitingFromFile

        if (
          normalizedPendingReminder &&
          (!isValidPendingReminder(pref.pendingReminder) ||
            pref.awaitingOpenerResponse !== true ||
            pref.pendingReminder?.dueAt !== normalizedPendingReminder.dueAt)
        ) {
          migrated = true
        }

        ticketDmPreferences.set(threadId, {
          openerId,
          enabled,
          awaitingOpenerResponse,
          ...(normalizedPendingReminder
            ? { pendingReminder: normalizedPendingReminder }
            : {}),
          ...(normalizedDeliveryStatus
            ? { lastDmDeliveryStatus: normalizedDeliveryStatus }
            : {}),
          ...(typeof toggleMessageUrl === 'string' &&
          toggleMessageUrl.length > 0
            ? { toggleMessageUrl }
            : {}),
        })
      }

      if (migrated) {
        await writeCurrentStoreToDisk().catch(() => void 0)
      }
    } catch (err) {
      const maybe = err as { code?: unknown }
      if (maybe.code !== 'ENOENT') {
        console.error('Failed to load ticket DM preferences:', err)
      }
    }
  })()

  return initPromise
}

async function persistStore(): Promise<void> {
  await initStore()
  await writeCurrentStoreToDisk()
}

function queuePersist(): Promise<void> {
  writeChain = writeChain.then(() => persistStore()).catch(() => persistStore())
  return writeChain
}

function queueDm(task: () => Promise<void>): Promise<void> {
  dmQueue = dmQueue
    .then(async () => {
      await task()
      await new Promise((resolve) => setTimeout(resolve, DM_QUEUE_SPACING_MS))
    })
    .catch(async () => {
      await task()
      await new Promise((resolve) => setTimeout(resolve, DM_QUEUE_SPACING_MS))
    })

  return dmQueue
}

function setRuntimeClient(client: Client): void {
  runtimeClient = client
  restorePendingReminderTimers()
}

function getNumericErrorCode(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function getDiscordErrorCode(error: unknown): number | null {
  if (!isObject(error)) return null

  const directCode = getNumericErrorCode(error.code)
  if (directCode !== null) return directCode

  if (isObject(error.rawError)) {
    const rawErrorCode = getNumericErrorCode(error.rawError.code)
    if (rawErrorCode !== null) return rawErrorCode
  }

  return null
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message

  if (isObject(error)) {
    if (typeof error.message === 'string') return error.message
    if (isObject(error.rawError) && typeof error.rawError.message === 'string') {
      return error.rawError.message
    }
  }

  return ''
}

function summarizeDmFailureReason(error: unknown): string {
  const code = getDiscordErrorCode(error)
  const message = getErrorMessage(error).replace(/\s+/g, ' ').trim()

  if (code !== null && message) {
    return `${message} (code ${code})`.slice(0, 220)
  }
  if (message) return message.slice(0, 220)
  if (code !== null) return `Discord API error code ${code}`
  return 'Unknown error while sending the DM reminder'
}

async function summarizeDmFailureReasonForThread(
  client: Client,
  threadId: string,
  openerId: string,
  error: unknown
): Promise<string> {
  const fallback = summarizeDmFailureReason(error)
  const code = getDiscordErrorCode(error)
  const message = getErrorMessage(error)

  const looksLikeNoMutualGuildIssue =
    code === 50278 || /no mutual guilds/i.test(message)
  if (!looksLikeNoMutualGuildIssue) {
    return fallback
  }

  const channel = await client.channels.fetch(threadId).catch(() => null)
  if (!channel || !channel.isThread()) {
    return fallback
  }

  const openerMember = await channel.guild.members
    .fetch(openerId)
    .catch(() => null)
  if (!openerMember) {
    return fallback
  }

  return 'Cannot send messages to this user (likely DMs disabled for this server or bot blocked)'
}

function getMessageIdFromUrl(url: string | undefined): string | null {
  if (!url) return null

  const parts = url.split('/').filter(Boolean)
  const last = parts.at(-1)
  if (!last || !/^\d{15,22}$/.test(last)) return null
  return last
}

function buildDmDeliveryStatusLine(
  status: TicketDmDeliveryStatus | undefined
): string | null {
  if (!status) return null

  if (status.state === 'active') {
    return `DM Delivery Status: Actively Sending DMs (last attempt: <t:${Math.floor(
      status.attemptedAt / 1000
    )}:R>)`
  }

  const reason = status.reason?.trim() || 'Unknown reason'
  return `DM Delivery Status: Unable to Send DMs due to ${reason} (last attempt: <t:${Math.floor(
    status.attemptedAt / 1000
  )}:R>)`
}

async function updateTogglePromptEmbed(threadId: string): Promise<void> {
  const client = runtimeClient
  if (!client) return

  const pref = ticketDmPreferences.get(threadId)
  if (!pref) return

  const messageId = getMessageIdFromUrl(pref.toggleMessageUrl)
  if (!messageId) return

  const channel = await client.channels.fetch(threadId).catch(() => null)
  if (!channel || !channel.isThread()) return

  const targetMessage = await channel.messages.fetch(messageId).catch(() => null)
  if (!targetMessage) return

  await targetMessage
    .edit({
      embeds: [
        updateDmResponseEmbed(pref.openerId, pref.enabled, pref.lastDmDeliveryStatus),
      ],
      components: [createDmOnResponsesRow(pref.openerId, pref.enabled)],
      allowedMentions: { parse: [] },
    })
    .catch(() => void 0)
}

function shouldSuppressDmReminderError(error: unknown): boolean {
  const code = getDiscordErrorCode(error)
  if (code !== null && EXPECTED_DM_DELIVERY_ERROR_CODES.has(code)) {
    return true
  }

  const message = getErrorMessage(error)
  return EXPECTED_DM_DELIVERY_ERROR_PATTERNS.some((pattern) =>
    pattern.test(message)
  )
}

function buildIssueDedupeKey(options: {
  reason: string
  threadId?: string
  openerId?: string
  error?: unknown
}): string {
  const code = getDiscordErrorCode(options.error)
  const message = getErrorMessage(options.error)
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 160)

  return [
    options.reason,
    options.threadId ?? '',
    options.openerId ?? '',
    code ?? '',
    message,
  ].join('|')
}

function hasRecentlyReportedIssue(key: string): boolean {
  const now = Date.now()

  for (const [existingKey, reportedAt] of recentlyReportedDmIssues) {
    if (now - reportedAt > DM_ISSUE_DEDUPE_WINDOW_MS) {
      recentlyReportedDmIssues.delete(existingKey)
    }
  }

  const lastReportedAt = recentlyReportedDmIssues.get(key)
  if (lastReportedAt && now - lastReportedAt <= DM_ISSUE_DEDUPE_WINDOW_MS) {
    return true
  }

  recentlyReportedDmIssues.set(key, now)
  return false
}

async function reportDmReminderIssue(options: {
  reason: string
  threadId?: string
  openerId?: string
  error?: unknown
}): Promise<void> {
  if (
    options.reason === 'Failed to send DM reminder' &&
    shouldSuppressDmReminderError(options.error)
  ) {
    return
  }

  const dedupeKey = buildIssueDedupeKey(options)
  if (hasRecentlyReportedIssue(dedupeKey)) {
    return
  }

  const details: Array<string> = [`[ticket-dm] ${options.reason}`]
  if (options.threadId) details.push(`thread=${options.threadId}`)
  if (options.openerId) details.push(`opener=${options.openerId}`)

  let errorText = ''
  if (typeof options.error === 'string') {
    errorText = options.error
  } else if (options.error instanceof Error) {
    errorText = options.error.stack || options.error.message
  } else if (options.error) {
    try {
      errorText = JSON.stringify(options.error)
    } catch {
      errorText = String(options.error)
    }
  }

  if (errorText) {
    details.push(`error=${errorText.slice(0, 1200)}`)
  }

  console.error(details.join(' | '), options.error)

  const client = runtimeClient
  if (!client) return

  const channel = await client.channels.fetch(DM_DEBUG_CHANNEL_ID).catch(() => null)
  if (!channel) return
  if (!('isTextBased' in channel) || !channel.isTextBased()) return
  const sendFn = (channel as { send?: unknown }).send
  if (typeof sendFn !== 'function') return

  await (sendFn as (options: unknown) => Promise<unknown>)
    .call(channel, {
      content: details.join('\n').slice(0, 1900),
      allowedMentions: { parse: [] },
    })
    .catch(() => void 0)
}

function clearPendingReminderTimer(threadId: string): void {
  const existing = pendingReminderTimers.get(threadId)
  if (!existing) return

  clearTimeout(existing)
  pendingReminderTimers.delete(threadId)
}

async function clearPendingReminder(threadId: string): Promise<void> {
  clearPendingReminderTimer(threadId)

  const pref = ticketDmPreferences.get(threadId)
  if (!pref?.pendingReminder) return

  const { pendingReminder: _removedReminder, ...nextPref } = pref
  ticketDmPreferences.set(threadId, {
    ...nextPref,
    awaitingOpenerResponse: false,
  })

  await queuePersist().catch(() => void 0)
}

function scheduleReminder(threadId: string, reminder: TicketPendingReminder): void {
  if (!runtimeClient) return
  if (pendingReminderTimers.has(threadId)) return

  const delay = Math.max(0, reminder.dueAt - Date.now())
  const timer = setTimeout(() => {
    void sendPendingReminder(threadId)
  }, delay)

  pendingReminderTimers.set(threadId, timer)
}

function restorePendingReminderTimers(): void {
  if (!runtimeClient) return

  for (const [threadId, pref] of ticketDmPreferences.entries()) {
    if (!pref.pendingReminder) continue
    if (pendingReminderTimers.has(threadId)) continue

    scheduleReminder(threadId, pref.pendingReminder)
  }
}

async function sendPendingReminder(threadId: string): Promise<void> {
  clearPendingReminderTimer(threadId)

  const client = runtimeClient
  if (!client) return

  const pref = ticketDmPreferences.get(threadId)
  const reminder = pref?.pendingReminder
  if (!pref || !pref.enabled || !reminder) return

  const embed = new EmbedBuilder()
    .setTitle('Ticket Response')
    .setDescription(
      `You have a new ticket response from ${reminder.responderName}. Please check it out: [Open Ticket](${reminder.messageUrl})\n\nYou can opt out of these reminders by using the toggle in your ticket: [Click here](${pref.toggleMessageUrl ?? reminder.messageUrl})`
    )
    .setColor('#ff3366')
    .setTimestamp()

  let sent = false
  let sendError: unknown = null
  await queueDm(async () => {
    const user = await client.users.fetch(pref.openerId).catch(() => null)
    if (!user) {
      throw new Error('Failed to fetch ticket opener user for DM reminder')
    }

    await user.send({ embeds: [embed] })
    sent = true
  }).catch(async (error) => {
    sendError = error
    await reportDmReminderIssue({
      reason: 'Failed to send DM reminder',
      threadId,
      openerId: pref.openerId,
      error,
    })
  })

  const latestPref = ticketDmPreferences.get(threadId)
  if (!latestPref) return

  let deliveryStatus: TicketDmDeliveryStatus
  if (sent) {
    deliveryStatus = {
      state: 'active',
      attemptedAt: Date.now(),
    }
  } else {
    const failureReason = await summarizeDmFailureReasonForThread(
      client,
      threadId,
      pref.openerId,
      sendError
    )
    deliveryStatus = {
      state: 'failed',
      attemptedAt: Date.now(),
      reason: failureReason,
    }
  }

  if (!sent) {
    const { pendingReminder: _failedReminder, ...nextPref } = latestPref
    ticketDmPreferences.set(threadId, {
      ...nextPref,
      enabled: false,
      awaitingOpenerResponse: false,
      lastDmDeliveryStatus: deliveryStatus,
    })
    await queuePersist().catch(() => void 0)
    await updateTogglePromptEmbed(threadId)
    return
  }

  const { pendingReminder: _removedReminder, ...nextPref } = latestPref
  ticketDmPreferences.set(threadId, {
    ...nextPref,
    awaitingOpenerResponse: true,
    lastDmDeliveryStatus: deliveryStatus,
  })
  await queuePersist().catch(() => void 0)
  await updateTogglePromptEmbed(threadId)
}

function buildToggleButton(openerId: string, enabled: boolean): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`dmOnResponses_${openerId}`)
    .setLabel(`DM on responses: ${enabled ? 'On' : 'Off'}`)
    .setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Secondary)
}

export function createDmOnResponsesRow(
  openerId: string,
  enabled = true
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    buildToggleButton(openerId, enabled)
  )
}

export async function registerTicketThread(
  threadId: string,
  openerId: string
): Promise<void> {
  await initStore()
  const existing = ticketDmPreferences.get(threadId)
  if (existing?.openerId === openerId) return

  ticketDmPreferences.set(threadId, {
    openerId,
    enabled: existing?.enabled ?? true,
    awaitingOpenerResponse: existing?.awaitingOpenerResponse ?? false,
    ...(existing?.pendingReminder
      ? { pendingReminder: existing.pendingReminder }
      : {}),
    ...(existing?.lastDmDeliveryStatus
      ? { lastDmDeliveryStatus: existing.lastDmDeliveryStatus }
      : {}),
    ...(existing?.toggleMessageUrl
      ? { toggleMessageUrl: existing.toggleMessageUrl }
      : {}),
  })
  await queuePersist().catch(() => void 0)
}

export async function toggleTicketDmResponses(
  threadId: string,
  openerId: string
): Promise<boolean> {
  await initStore()

  const current = ticketDmPreferences.get(threadId)
  if (current && current.openerId !== openerId) {
    return current.enabled
  }

  const nextEnabled = !(current?.enabled ?? false)
  ticketDmPreferences.set(threadId, {
    openerId,
    enabled: nextEnabled,
    awaitingOpenerResponse: current?.awaitingOpenerResponse ?? false,
    ...(current?.pendingReminder
      ? { pendingReminder: current.pendingReminder }
      : {}),
    ...(current?.lastDmDeliveryStatus
      ? { lastDmDeliveryStatus: current.lastDmDeliveryStatus }
      : {}),
    ...(current?.toggleMessageUrl
      ? { toggleMessageUrl: current.toggleMessageUrl }
      : {}),
  })

  if (!nextEnabled) {
    await clearPendingReminder(threadId)
  }

  await queuePersist().catch(() => void 0)
  return nextEnabled
}

export async function removeTicketDmPreference(threadId: string): Promise<void> {
  await initStore()
  clearPendingReminderTimer(threadId)
  ticketDmPreferences.delete(threadId)
  await queuePersist().catch(() => void 0)
}

export function updateDmResponseEmbed(
  openerId: string,
  enabled: boolean,
  status?: TicketDmDeliveryStatus
): EmbedBuilder {
  const statusLine = enabled
    ? `<@${openerId}> has opted in for DM responses.`
    : `<@${openerId}> has opted out of DM responses.`
  const deliveryStatusLine = buildDmDeliveryStatusLine(status)
  const deliveryStatusText = deliveryStatusLine
    ? `\n\n${deliveryStatusLine}`
    : ''

  return new EmbedBuilder()
    .setTitle('Ticket Response Notifications')
    .setDescription(
      `${statusLine}\n\nWhen staff respond in this ticket, you will receive a DM reminder if you have not replied after 5 minutes.\nTo disable these DMs, toggle the button below.${deliveryStatusText}`
    )
    .setColor(enabled ? '#2ecc71' : '#95a5a6')
}

export function getTicketDmDeliveryStatus(
  threadId: string
): TicketDmDeliveryStatus | undefined {
  return ticketDmPreferences.get(threadId)?.lastDmDeliveryStatus
}

export async function sendDmOnResponsesPrompt(
  thread: ThreadChannel,
  openerId: string
): Promise<void> {
  setRuntimeClient(thread.client)
  await registerTicketThread(thread.id, openerId)

  const sent = await thread.send({
    embeds: [updateDmResponseEmbed(openerId, true)],
    components: [createDmOnResponsesRow(openerId, true)],
    allowedMentions: { parse: [], users: [openerId] },
  })

  const current = ticketDmPreferences.get(thread.id)
  ticketDmPreferences.set(thread.id, {
    openerId,
    enabled: current?.enabled ?? true,
    awaitingOpenerResponse: current?.awaitingOpenerResponse ?? false,
    ...(current?.pendingReminder
      ? { pendingReminder: current.pendingReminder }
      : {}),
    ...(current?.lastDmDeliveryStatus
      ? { lastDmDeliveryStatus: current.lastDmDeliveryStatus }
      : {}),
    toggleMessageUrl: sent.url,
  })
  await queuePersist().catch(() => void 0)
}

export async function maybeNotifyTicketResponse(message: Message): Promise<void> {
  try {
    setRuntimeClient(message.client)

    if (!message.inGuild()) return
    if (message.author.bot || message.webhookId || message.system) return
    if (!isSupportedTicketThread(message)) return

    await initStore()
    const pref = ticketDmPreferences.get(message.channel.id)
    if (!pref || !pref.enabled) return

    // The opener replied in-thread, so cancel any pending reminder
    // and allow the next staff cycle to notify again.
    if (message.author.id === pref.openerId) {
      await clearPendingReminder(message.channel.id)

      const latestPref = ticketDmPreferences.get(message.channel.id)
      if (latestPref?.awaitingOpenerResponse) {
        ticketDmPreferences.set(message.channel.id, {
          ...latestPref,
          awaitingOpenerResponse: false,
        })
        await queuePersist().catch(() => void 0)
      }

      return
    }

    if (!(await isStaffMessage(message))) return

    // Notify once per staff cycle.
    if (pref.awaitingOpenerResponse) return
    if (pref.pendingReminder) return

    const dueAt = Date.now() + STAFF_RESPONSE_REMINDER_DELAY_MS
    const pendingReminder: TicketPendingReminder = {
      dueAt,
      messageUrl: message.url,
      responderName: message.member?.displayName ?? message.author.username,
    }

    ticketDmPreferences.set(message.channel.id, {
      ...pref,
      awaitingOpenerResponse: true,
      pendingReminder,
    })
    await queuePersist().catch(() => void 0)

    scheduleReminder(message.channel.id, pendingReminder)
  } catch (error) {
    await reportDmReminderIssue({
      reason: 'Error in ticket DM reminder workflow',
      threadId: message.channel.id,
      error,
    })
  }
}

export async function initializeTicketDmStore(client: Client): Promise<void> {
  setRuntimeClient(client)
  await initStore()
}
