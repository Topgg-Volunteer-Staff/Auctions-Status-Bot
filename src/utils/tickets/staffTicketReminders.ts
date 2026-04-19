import { ChatInputCommandInteraction, Client, EmbedBuilder, Guild, Message, TextChannel, ThreadChannel } from 'discord.js'
import { channelIds, roleIds } from '../../globals'
import {
  loadMongoBackedJson,
  saveMongoBackedJson,
} from '../db/mongoBackedJsonStore'

type ReminderDelayChoice = {
  name: string
  value: string
  delayMs: number | null
}

type PendingStaffReminder = {
  dueAt: number
  messageUrl: string
  responderName: string
}

type StaffTicketReminderPreference = {
  userId: string
  delayMs: number
  pendingReminder?: PendingStaffReminder
}

type PersistedStaffTicketReminderStore = Record<
  string,
  Record<string, StaffTicketReminderPreference>
>

const STAFF_TICKET_REMINDER_STORE_KEY = 'staff-ticket-reminders'
const DM_QUEUE_SPACING_MS = 1_000
const TICKET_REMINDER_DM_FALLBACK_CHANNEL_ID =
  channelIds.inactiveThreadAlertsReviewers

export const TICKET_REMINDER_DELAY_CHOICES: Array<ReminderDelayChoice> = [
  { name: '1 minute', value: '1m', delayMs: 1 * 60_000 },
  { name: '10 minutes', value: '10m', delayMs: 10 * 60_000 },
  { name: '30 minutes', value: '30m', delayMs: 30 * 60_000 },
  { name: '2 hours', value: '2h', delayMs: 2 * 60 * 60_000 },
  { name: '6 hours', value: '6h', delayMs: 6 * 60 * 60_000 },
  { name: '12 hours', value: '12h', delayMs: 12 * 60 * 60_000 },
  { name: '1 day', value: '1d', delayMs: 24 * 60 * 60_000 },
  { name: 'Off', value: 'off', delayMs: null },
]

const reminderPreferences = new Map<
  string,
  Map<string, StaffTicketReminderPreference>
>()
const pendingReminderTimers = new Map<string, NodeJS.Timeout>()

let initPromise: Promise<void> | null = null
let writeChain: Promise<void> = Promise.resolve()
let dmQueue: Promise<void> = Promise.resolve()
let runtimeClient: Client | null = null

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getTimerKey(threadId: string, userId: string): string {
  return `${threadId}:${userId}`
}

function isSupportedTicketThread(thread: ThreadChannel): boolean {
  return (
    thread.parentId === channelIds.modTickets ||
    thread.parentId === channelIds.auctionsTickets
  )
}

async function isStaffUserInGuild(
  guild: Guild | null,
  userId: string
): Promise<boolean> {
  if (!guild) return false

  const member = await guild.members.fetch(userId).catch(() => null)
  if (!member) return false

  return [
    roleIds.moderator,
    roleIds.reviewer,
    roleIds.trialReviewer,
    roleIds.supportTeam,
  ].some((roleId) => member.roles.cache.has(roleId))
}

export async function isStaffReminderEligibleInteraction(
  interaction: ChatInputCommandInteraction
): Promise<boolean> {
  return isStaffUserInGuild(interaction.guild, interaction.user.id)
}

function normalizeTimestamp(value: number): number {
  return value < 1_000_000_000_000 ? value * 1000 : value
}

function isValidPendingReminder(value: unknown): value is PendingStaffReminder {
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

function normalizePendingReminder(value: unknown): PendingStaffReminder | null {
  if (!isValidPendingReminder(value)) return null

  return {
    dueAt: normalizeTimestamp(value.dueAt),
    messageUrl: value.messageUrl,
    responderName: value.responderName,
  }
}

function setRuntimeClient(client: Client): void {
  runtimeClient = client
  restorePendingReminderTimers()
}

function getThreadPreferences(
  threadId: string,
  create = false
): Map<string, StaffTicketReminderPreference> | undefined {
  let threadPrefs = reminderPreferences.get(threadId)
  if (!threadPrefs && create) {
    threadPrefs = new Map<string, StaffTicketReminderPreference>()
    reminderPreferences.set(threadId, threadPrefs)
  }

  return threadPrefs
}

async function writeCurrentStore(): Promise<void> {
  const data: PersistedStaffTicketReminderStore = {}

  for (const [threadId, threadPrefs] of reminderPreferences.entries()) {
    if (threadPrefs.size === 0) continue

    const serializedThreadPrefs: Record<string, StaffTicketReminderPreference> = {}
    for (const [userId, pref] of threadPrefs.entries()) {
      serializedThreadPrefs[userId] = pref
    }
    data[threadId] = serializedThreadPrefs
  }

  await saveMongoBackedJson(STAFF_TICKET_REMINDER_STORE_KEY, data, {
    operation: 'persist',
  })
}

async function initStore(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    const parsed = await loadMongoBackedJson<unknown>(
      STAFF_TICKET_REMINDER_STORE_KEY,
      {}
    )
    if (!isObject(parsed)) return

    reminderPreferences.clear()

    for (const [threadId, rawThreadPrefs] of Object.entries(parsed)) {
      if (typeof threadId !== 'string' || !isObject(rawThreadPrefs)) continue

      const threadPrefs = new Map<string, StaffTicketReminderPreference>()

      for (const [userId, rawPref] of Object.entries(rawThreadPrefs)) {
        if (typeof userId !== 'string' || !isObject(rawPref)) continue
        if (rawPref.userId !== userId) continue
        if (
          typeof rawPref.delayMs !== 'number' ||
          !Number.isFinite(rawPref.delayMs)
        ) {
          continue
        }

        const pendingReminder = normalizePendingReminder(rawPref.pendingReminder)

        threadPrefs.set(userId, {
          userId,
          delayMs: rawPref.delayMs,
          ...(pendingReminder ? { pendingReminder } : {}),
        })
      }

      if (threadPrefs.size > 0) {
        reminderPreferences.set(threadId, threadPrefs)
      }
    }
  })()

  return initPromise
}

function queuePersist(): Promise<void> {
  writeChain = writeChain
    .then(() => writeCurrentStore())
    .catch(() => writeCurrentStore())
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

function clearPendingReminderTimer(threadId: string, userId: string): void {
  const timerKey = getTimerKey(threadId, userId)
  const existing = pendingReminderTimers.get(timerKey)
  if (!existing) return

  clearTimeout(existing)
  pendingReminderTimers.delete(timerKey)
}

async function clearPendingReminder(
  threadId: string,
  userId: string,
  persist = true
): Promise<void> {
  clearPendingReminderTimer(threadId, userId)

  const threadPrefs = getThreadPreferences(threadId)
  const pref = threadPrefs?.get(userId)
  if (!threadPrefs || !pref?.pendingReminder) return

  const { pendingReminder: _removedReminder, ...nextPref } = pref
  threadPrefs.set(userId, nextPref)

  if (persist) {
    await queuePersist().catch(() => void 0)
  }
}

function schedulePendingReminder(
  threadId: string,
  userId: string,
  reminder: PendingStaffReminder
): void {
  if (!runtimeClient) return

  clearPendingReminderTimer(threadId, userId)

  const delay = Math.max(0, reminder.dueAt - Date.now())
  const timer = setTimeout(() => {
    void sendPendingReminder(threadId, userId)
  }, delay)

  pendingReminderTimers.set(getTimerKey(threadId, userId), timer)
}

function restorePendingReminderTimers(): void {
  if (!runtimeClient) return

  for (const [threadId, threadPrefs] of reminderPreferences.entries()) {
    for (const [userId, pref] of threadPrefs.entries()) {
      if (!pref.pendingReminder) continue
      if (pendingReminderTimers.has(getTimerKey(threadId, userId))) continue

      schedulePendingReminder(threadId, userId, pref.pendingReminder)
    }
  }
}

async function notifyReminderDmFailure(
  client: Client,
  threadId: string,
  userId: string,
  messageUrl: string
): Promise<void> {
  const channel = (await client.channels
    .fetch(TICKET_REMINDER_DM_FALLBACK_CHANNEL_ID)
    .catch(() => null)) as TextChannel | null

  if (!channel) {
    console.warn(
      `[staff-ticket-reminders] Failed to find DM fallback channel ${TICKET_REMINDER_DM_FALLBACK_CHANNEL_ID}`
    )
    return
  }

  await channel
    .send({
      content:
        `<@${userId}> I couldn't DM your /ticket-reminder notification for <#${threadId}>. ` +
        `Please enable your DMs in the main server or VC server so reminders can reach you. ` +
        `${messageUrl}`,
      allowedMentions: {
        users: [userId],
        roles: [],
        parse: [],
      },
    })
    .catch((error) => {
      console.error(
        `[staff-ticket-reminders] Failed to send DM fallback notice for ${threadId}:${userId}`,
        error
      )
    })
}

async function sendPendingReminder(
  threadId: string,
  userId: string
): Promise<void> {
  clearPendingReminderTimer(threadId, userId)

  const client = runtimeClient
  if (!client) return

  const threadPrefs = getThreadPreferences(threadId)
  const pref = threadPrefs?.get(userId)
  const reminder = pref?.pendingReminder
  if (!threadPrefs || !pref || !reminder) return

  const embed = new EmbedBuilder()
    .setTitle('Ticket Reminder')
    .setDescription(
      `${reminder.responderName} sent a new message in your ticket thread: [Open Ticket](${reminder.messageUrl})`
    )
    .setColor('#ff3366')
    .setTimestamp()

  try {
    await queueDm(async () => {
      const user = await client.users.fetch(userId).catch(() => null)
      if (!user) {
        throw new Error('Failed to fetch staff member for ticket reminder DM')
      }

      await user.send({ embeds: [embed] })
    })
  } catch (error) {
    console.error(
      `[staff-ticket-reminders] Failed to send reminder for ${threadId}:${userId}`,
      error
    )

    await notifyReminderDmFailure(
      client,
      threadId,
      userId,
      reminder.messageUrl
    )
  }

  await clearPendingReminder(threadId, userId)
}

export function getTicketReminderDelayMs(choice: string): number | null {
  const matched = TICKET_REMINDER_DELAY_CHOICES.find(
    (option) => option.value === choice
  )
  return matched?.delayMs ?? null
}

export function getTicketReminderDelayLabel(choice: string): string | null {
  const matched = TICKET_REMINDER_DELAY_CHOICES.find(
    (option) => option.value === choice
  )
  return matched?.name ?? null
}

export async function setStaffTicketReminderPreference(
  threadId: string,
  userId: string,
  delayMs: number
): Promise<void> {
  await initStore()

  const threadPrefs = getThreadPreferences(threadId, true)
  if (!threadPrefs) return

  const existing = threadPrefs.get(userId)
  threadPrefs.set(userId, {
    userId,
    delayMs,
    ...(existing?.pendingReminder
      ? { pendingReminder: existing.pendingReminder }
      : {}),
  })

  await queuePersist().catch(() => void 0)
}

export async function removeStaffTicketReminderPreference(
  threadId: string,
  userId: string
): Promise<void> {
  await initStore()
  clearPendingReminderTimer(threadId, userId)

  const threadPrefs = getThreadPreferences(threadId)
  if (!threadPrefs) return

  threadPrefs.delete(userId)
  if (threadPrefs.size === 0) {
    reminderPreferences.delete(threadId)
  }

  await queuePersist().catch(() => void 0)
}

export async function maybeHandleStaffTicketReminder(
  message: Message
): Promise<void> {
  setRuntimeClient(message.client)

  if (!message.inGuild()) return
  if (message.author.bot || message.webhookId || message.system) return
  if (!message.channel.isThread()) return
  if (!isSupportedTicketThread(message.channel)) return

  await initStore()

  const threadPrefs = getThreadPreferences(message.channel.id)
  if (!threadPrefs || threadPrefs.size === 0) return

  const isStaffAuthor = await isStaffUserInGuild(message.guild, message.author.id)

  if (isStaffAuthor) {
    if (!threadPrefs.has(message.author.id)) return
    await clearPendingReminder(message.channel.id, message.author.id)
    return
  }

  let changed = false

  for (const [userId, pref] of threadPrefs.entries()) {
    const pendingReminder: PendingStaffReminder = {
      dueAt: Date.now() + pref.delayMs,
      messageUrl: message.url,
      responderName: message.member?.displayName ?? message.author.username,
    }

    threadPrefs.set(userId, {
      ...pref,
      pendingReminder,
    })
    schedulePendingReminder(message.channel.id, userId, pendingReminder)
    changed = true
  }

  if (changed) {
    await queuePersist().catch(() => void 0)
  }
}

export async function initializeStaffTicketReminderStore(
  client: Client
): Promise<void> {
  setRuntimeClient(client)
  await initStore()
}