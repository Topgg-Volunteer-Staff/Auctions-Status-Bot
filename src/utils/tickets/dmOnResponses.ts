import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Message,
  ThreadChannel,
} from 'discord.js'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { channelIds, roleIds } from '../../globals'

type TicketPendingReminder = {
  dueAt: number
  messageUrl: string
  responderName: string
}

type TicketDmPreference = {
  openerId: string
  enabled: boolean
  toggleMessageUrl?: string
  awaitingOpenerResponse?: boolean
  pendingReminder?: TicketPendingReminder
}

type PersistedTicketDmPreferences = Record<string, TicketDmPreference>

const DATA_DIR = path.join(process.cwd(), 'data')
const TICKET_DM_PREFS_PATH = path.join(DATA_DIR, 'ticket-dm-responses.json')

const STAFF_RESPONSE_REMINDER_DELAY_MS = 5 * 60_000
const DM_QUEUE_SPACING_MS = 1_000

const ticketDmPreferences = new Map<string, TicketDmPreference>()
const pendingReminderTimers = new Map<string, NodeJS.Timeout>()

let initPromise: Promise<void> | null = null
let writeChain: Promise<void> = Promise.resolve()
let dmQueue: Promise<void> = Promise.resolve()
let runtimeClient: Client | null = null

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStaffMessage(message: Message): boolean {
  if (!message.inGuild()) return false

  const member = message.member
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

async function writeCurrentStoreToDisk(): Promise<void> {
  const data: PersistedTicketDmPreferences = {}
  for (const [threadId, pref] of ticketDmPreferences.entries()) {
    data[threadId] = pref
  }

  const payload = JSON.stringify(data, null, 2)
  const tmpPath = path.join(
    DATA_DIR,
    `ticket-dm-responses.${Date.now()}.${Math.random()
      .toString(16)
      .slice(2)}.tmp`
  )

  await writeFile(TICKET_DM_PREFS_PATH, payload, 'utf8').catch(async () => {
    await writeFile(tmpPath, payload, 'utf8')
    await rename(tmpPath, TICKET_DM_PREFS_PATH)
  })
}

async function initStore(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    await mkdir(DATA_DIR, { recursive: true })
    try {
      const raw = await readFile(TICKET_DM_PREFS_PATH, 'utf8')
      const parsed: unknown = JSON.parse(raw)
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

  await queueDm(async () => {
    const user = await client.users.fetch(pref.openerId).catch(() => null)
    if (!user) return

    await user.send({ embeds: [embed] }).catch(() => void 0)
  }).catch(() => void 0)

  const { pendingReminder: _removedReminder, ...nextPref } = pref
  ticketDmPreferences.set(threadId, {
    ...nextPref,
    awaitingOpenerResponse: true,
  })
  await queuePersist().catch(() => void 0)
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
  enabled: boolean
): EmbedBuilder {
  const statusLine = enabled
    ? `<@${openerId}> has opted in for DM responses.`
    : `<@${openerId}> has opted out of DM responses.`

  return new EmbedBuilder()
    .setTitle('Ticket Response Notifications')
    .setDescription(
      `${statusLine}\n\nWhen staff respond in this ticket, you will receive a DM reminder if you have not replied after 5 minutes.\nTo disable these DMs, toggle the button below.`
    )
    .setColor(enabled ? '#2ecc71' : '#95a5a6')
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
    toggleMessageUrl: sent.url,
  })
  await queuePersist().catch(() => void 0)
}

export async function maybeNotifyTicketResponse(message: Message): Promise<void> {
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

  if (!isStaffMessage(message)) return

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
}

void initStore()
