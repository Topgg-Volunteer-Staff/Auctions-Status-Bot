import { ThreadChannel } from 'discord.js'

import {
  loadMongoBackedJson,
  saveMongoBackedJson,
} from '../db/mongoBackedJsonStore'
import { isStaffUserInGuild } from './staffTicketReminders'

const threadLastMessage = new Map<string, number>()
const threadLastStaffMessage = new Map<string, number>()
const MESSAGE_SCAN_PAGE_SIZE = 100

type AlertType = '48h' | '7d'

type ThreadAlertState = {
  sent48h: boolean
  last7dInterval: number
  last14dStaffActivityAlertedAt: number | null
}

type PersistedThreadAlertState = ThreadAlertState
type LegacyPersistedThreadAlertState = Array<AlertType>
type PersistedThreadAlerts = Record<
  string,
  PersistedThreadAlertState | LegacyPersistedThreadAlertState
>

const threadAlertStates = new Map<string, ThreadAlertState>()

const INACTIVE_ALERTS_STORE_KEY = 'inactive-thread-alerts'

let inactiveAlertsWriteChain: Promise<void> = Promise.resolve()
let inactiveAlertsInitPromise: Promise<void> | null = null

function isAlertType(value: unknown): value is AlertType {
  return value === '48h' || value === '7d'
}

function normalizeThreadAlertState(value: unknown): ThreadAlertState | null {
  // Migrate the original array format. A saved 7d marker means the first
  // seven-day reminder was sent, so the next one is due at 14 days.
  if (Array.isArray(value)) {
    const alertTypes = value.filter(isAlertType)
    if (alertTypes.length === 0) return null

    return {
      sent48h: alertTypes.includes('48h'),
      last7dInterval: alertTypes.includes('7d') ? 1 : 0,
      last14dStaffActivityAlertedAt: null,
    }
  }

  if (!value || typeof value !== 'object') return null

  const state = value as Record<string, unknown>
  if (
    typeof state.sent48h !== 'boolean' ||
    typeof state.last7dInterval !== 'number' ||
    !Number.isInteger(state.last7dInterval) ||
    state.last7dInterval < 0
  ) {
    return null
  }

  return {
    sent48h: state.sent48h,
    last7dInterval: state.last7dInterval,
    last14dStaffActivityAlertedAt:
      typeof state.last14dStaffActivityAlertedAt === 'number' &&
      Number.isFinite(state.last14dStaffActivityAlertedAt)
        ? state.last14dStaffActivityAlertedAt
        : null,
  }
}

async function initInactiveAlertsStore(): Promise<void> {
  if (inactiveAlertsInitPromise) return inactiveAlertsInitPromise

  inactiveAlertsInitPromise = (async () => {
    try {
      const parsed = await loadMongoBackedJson<unknown>(
        INACTIVE_ALERTS_STORE_KEY,
        {}
      )
      if (!parsed || typeof parsed !== 'object') return

      threadAlertStates.clear()

      for (const [threadId, stateUnknown] of Object.entries(
        parsed as Record<string, unknown>
      )) {
        if (typeof threadId !== 'string' || threadId.length === 0) continue

        const state = normalizeThreadAlertState(stateUnknown)
        if (state) threadAlertStates.set(threadId, state)
      }
    } catch (error) {
      console.error('Failed to load inactive thread alerts store:', error)
    }
  })()

  return inactiveAlertsInitPromise
}

async function persistInactiveAlerts(): Promise<void> {
  const obj: PersistedThreadAlerts = {}
  for (const [threadId, state] of threadAlertStates.entries()) {
    obj[threadId] = state
  }
  await saveMongoBackedJson(INACTIVE_ALERTS_STORE_KEY, obj, {
    operation: 'persist',
  })
}

function queuePersistInactiveAlerts(): Promise<void> {
  inactiveAlertsWriteChain = inactiveAlertsWriteChain
    .then(() => persistInactiveAlerts())
    .catch(() => persistInactiveAlerts())

  return inactiveAlertsWriteChain
}

export async function initializeInactiveAlertStore(): Promise<void> {
  await initInactiveAlertsStore()
}

export async function updateThreadActivity(threadId: string): Promise<void> {
  await initInactiveAlertsStore()
  threadLastMessage.set(threadId, Date.now())

  const existing = threadAlertStates.get(threadId)
  if (existing?.last14dStaffActivityAlertedAt) {
    threadAlertStates.set(threadId, {
      sent48h: false,
      last7dInterval: 0,
      last14dStaffActivityAlertedAt: existing.last14dStaffActivityAlertedAt,
    })
  } else {
    threadAlertStates.delete(threadId)
  }

  await queuePersistInactiveAlerts().catch(() => void 0)
}

export function updateThreadStaffActivity(
  threadId: string,
  messageTimestamp = Date.now()
): void {
  threadLastStaffMessage.set(threadId, messageTimestamp)
}

export function getThreadLastMessage(threadId: string): number | null {
  return threadLastMessage.get(threadId) ?? null
}

export function getThreadLastStaffMessage(threadId: string): number | null {
  return threadLastStaffMessage.get(threadId) ?? null
}

export function has48HourAlertBeenSent(threadId: string): boolean {
  return threadAlertStates.get(threadId)?.sent48h ?? false
}

export function getLast7DayAlertInterval(threadId: string): number {
  return threadAlertStates.get(threadId)?.last7dInterval ?? 0
}

function getOrCreateThreadAlertState(threadId: string): ThreadAlertState {
  const existing = threadAlertStates.get(threadId)
  if (existing) return existing

  const state: ThreadAlertState = {
    sent48h: false,
    last7dInterval: 0,
    last14dStaffActivityAlertedAt: null,
  }
  threadAlertStates.set(threadId, state)
  return state
}

export async function mark48HourAlertSent(threadId: string): Promise<void> {
  await initInactiveAlertsStore()
  getOrCreateThreadAlertState(threadId).sent48h = true
  await queuePersistInactiveAlerts().catch(() => void 0)
}

export async function mark7DayAlertSent(
  threadId: string,
  interval: number
): Promise<void> {
  await initInactiveAlertsStore()
  const state = getOrCreateThreadAlertState(threadId)
  state.last7dInterval = interval
  state.sent48h = true
  await queuePersistInactiveAlerts().catch(() => void 0)
}

export function has14DayStaffAlertBeenSent(
  threadId: string,
  staffActivityAt: number
): boolean {
  return (
    threadAlertStates.get(threadId)?.last14dStaffActivityAlertedAt ===
    staffActivityAt
  )
}

export async function mark14DayStaffAlertSent(
  threadId: string,
  staffActivityAt: number
): Promise<void> {
  await mark14DayStaffAlertsSent([{ threadId, staffActivityAt }])
}

export async function mark14DayStaffAlertsSent(
  alerts: Array<{ threadId: string; staffActivityAt: number }>
): Promise<void> {
  await initInactiveAlertsStore()

  for (const { threadId, staffActivityAt } of alerts) {
    getOrCreateThreadAlertState(threadId).last14dStaffActivityAlertedAt =
      staffActivityAt
  }

  await queuePersistInactiveAlerts().catch(() => void 0)
}

export function getAllTrackedThreads(): Array<string> {
  return Array.from(threadLastMessage.keys())
}

export async function removeThread(threadId: string): Promise<void> {
  await initInactiveAlertsStore()
  threadLastMessage.delete(threadId)
  threadLastStaffMessage.delete(threadId)
  threadAlertStates.delete(threadId)
  await queuePersistInactiveAlerts().catch(() => void 0)
}

export async function initializeThreadActivity(
  thread: ThreadChannel
): Promise<void> {
  await initInactiveAlertsStore()
  threadLastStaffMessage.delete(thread.id)

  try {
    let before: string | undefined
    let latestMessageTimestamp: number | null = null
    let latestStaffMessageTimestamp: number | null = null
    let hasMoreMessages = true
    const staffMembershipCache = new Map<string, boolean>()

    while (hasMoreMessages) {
      const messages = await thread.messages.fetch({
        limit: MESSAGE_SCAN_PAGE_SIZE,
        ...(before ? { before } : {}),
      })
      if (messages.size === 0) break

      const orderedMessages = [...messages.values()].sort(
        (left, right) => right.createdTimestamp - left.createdTimestamp
      )

      latestMessageTimestamp ??= orderedMessages[0]?.createdTimestamp ?? null

      for (const message of orderedMessages) {
        if (message.author.bot || message.webhookId || message.system) continue

        let isStaffAuthor = staffMembershipCache.get(message.author.id)
        if (typeof isStaffAuthor !== 'boolean') {
          isStaffAuthor = await isStaffUserInGuild(
            thread.guild,
            message.author.id
          )
          staffMembershipCache.set(message.author.id, isStaffAuthor)
        }

        if (isStaffAuthor) {
          latestStaffMessageTimestamp = message.createdTimestamp
          break
        }
      }

      if (latestStaffMessageTimestamp !== null) break

      const oldestMessage = orderedMessages[orderedMessages.length - 1]
      before = oldestMessage?.id
      hasMoreMessages =
        messages.size === MESSAGE_SCAN_PAGE_SIZE && typeof before === 'string'
    }

    threadLastMessage.set(
      thread.id,
      latestMessageTimestamp ?? thread.createdTimestamp ?? Date.now()
    )

    if (latestStaffMessageTimestamp !== null) {
      threadLastStaffMessage.set(thread.id, latestStaffMessageTimestamp)
    }
  } catch (error) {
    console.error(
      `Failed to initialize thread activity for ${thread.id}:`,
      error
    )
  }
}
