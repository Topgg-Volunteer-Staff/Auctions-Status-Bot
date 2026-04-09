import { ThreadChannel } from 'discord.js'

import {
  loadMongoBackedJson,
  saveMongoBackedJson,
} from '../db/mongoBackedJsonStore'

const threadLastMessage = new Map<string, number>()

type AlertType = '48h' | '7d'

const threadAlertsSent = new Map<string, Set<AlertType>>()

type PersistedThreadAlerts = Record<string, Array<AlertType>>

const INACTIVE_ALERTS_STORE_KEY = 'inactive-thread-alerts'

let inactiveAlertsWriteChain: Promise<void> = Promise.resolve()
let inactiveAlertsInitPromise: Promise<void> | null = null

function isAlertType(value: unknown): value is AlertType {
  return value === '48h' || value === '7d'
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

      threadAlertsSent.clear()

      for (const [threadId, alertTypesUnknown] of Object.entries(
        parsed as Record<string, unknown>
      )) {
        if (typeof threadId !== 'string' || threadId.length === 0) continue
        if (!Array.isArray(alertTypesUnknown) || alertTypesUnknown.length === 0)
          continue

        const set = new Set<AlertType>()
        for (const t of alertTypesUnknown) {
          if (isAlertType(t)) set.add(t)
        }
        if (set.size > 0) threadAlertsSent.set(threadId, set)
      }
    } catch (error) {
      console.error('Failed to load inactive thread alerts store:', error)
    }
  })()

  return inactiveAlertsInitPromise
}

async function persistInactiveAlerts(): Promise<void> {
  const obj: PersistedThreadAlerts = {}
  for (const [threadId, set] of threadAlertsSent.entries()) {
    obj[threadId] = Array.from(set)
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
  threadAlertsSent.delete(threadId)
  await queuePersistInactiveAlerts().catch(() => void 0)
}

export function getThreadLastMessage(threadId: string): number | null {
  return threadLastMessage.get(threadId) ?? null
}

export function hasAlertBeenSent(
  threadId: string,
  alertType: '48h' | '7d'
): boolean {
  const alerts = threadAlertsSent.get(threadId)
  return alerts?.has(alertType) ?? false
}

export async function markAlertSent(
  threadId: string,
  alertType: '48h' | '7d'
): Promise<void> {
  await initInactiveAlertsStore()
  if (!threadAlertsSent.has(threadId)) {
    threadAlertsSent.set(threadId, new Set())
  }
  const alerts = threadAlertsSent.get(threadId)
  if (!alerts) return
  alerts.add(alertType)
  await queuePersistInactiveAlerts().catch(() => void 0)
}

export function getAllTrackedThreads(): Array<string> {
  return Array.from(threadLastMessage.keys())
}

export async function removeThread(threadId: string): Promise<void> {
  await initInactiveAlertsStore()
  threadLastMessage.delete(threadId)
  threadAlertsSent.delete(threadId)
  await queuePersistInactiveAlerts().catch(() => void 0)
}

export async function initializeThreadActivity(
  thread: ThreadChannel
): Promise<void> {
  await initInactiveAlertsStore()

  try {
    const messages = await thread.messages.fetch({ limit: 1 })
    const lastMessage = messages.first()

    if (lastMessage && !lastMessage.system) {
      threadLastMessage.set(thread.id, lastMessage.createdTimestamp)
    } else {
      threadLastMessage.set(thread.id, thread.createdTimestamp ?? Date.now())
    }
  } catch (error) {
    console.error(
      `Failed to initialize thread activity for ${thread.id}:`,
      error
    )
  }
}
