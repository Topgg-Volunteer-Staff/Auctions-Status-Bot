import { ThreadChannel } from 'discord.js'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const threadLastMessage = new Map<string, number>()

const threadAlertsSent = new Map<string, Set<'48h' | '7d'>>()

type PersistedThreadAlerts = Record<string, Array<'48h' | '7d'>>

const INACTIVE_ALERTS_DIR = path.join(process.cwd(), 'data')
const INACTIVE_ALERTS_PATH = path.join(
  INACTIVE_ALERTS_DIR,
  'inactive-thread-alerts.json'
)

let inactiveAlertsWriteChain: Promise<void> = Promise.resolve()

function loadPersistedInactiveAlertsSync(): void {
  try {
    const raw = readFileSync(INACTIVE_ALERTS_PATH, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return

    for (const [threadId, alertTypes] of Object.entries(
      parsed as PersistedThreadAlerts
    )) {
      if (typeof threadId !== 'string' || threadId.length === 0) continue
      if (!Array.isArray(alertTypes) || alertTypes.length === 0) continue

      const set = new Set<'48h' | '7d'>()
      for (const t of alertTypes) {
        if (t === '48h' || t === '7d') set.add(t)
      }
      if (set.size > 0) threadAlertsSent.set(threadId, set)
    }
  } catch (err) {
    const maybe = err as { code?: unknown }
    // ENOENT is fine (first run). Anything else: treat as non-fatal.
    if (maybe.code !== 'ENOENT') {
      console.error('Failed to load inactive thread alerts store:', err)
    }
  }
}

async function persistInactiveAlerts(): Promise<void> {
  await mkdir(INACTIVE_ALERTS_DIR, { recursive: true })

  const obj: PersistedThreadAlerts = {}
  for (const [threadId, set] of threadAlertsSent.entries()) {
    obj[threadId] = Array.from(set)
  }

  const json = JSON.stringify(obj, null, 2)
  const tmpPath = path.join(
    INACTIVE_ALERTS_DIR,
    `inactive-thread-alerts.${Date.now()}.${Math.random()
      .toString(16)
      .slice(2)}.tmp`
  )

  await writeFile(INACTIVE_ALERTS_PATH, json, 'utf8').catch(async () => {
    await writeFile(tmpPath, json, 'utf8')
    await rename(tmpPath, INACTIVE_ALERTS_PATH)
  })
}

function queuePersistInactiveAlerts(): void {
  inactiveAlertsWriteChain = inactiveAlertsWriteChain
    .then(() => persistInactiveAlerts())
    .catch(() => persistInactiveAlerts())
}

// Load persisted alert state on startup so restarts don't re-alert.
loadPersistedInactiveAlertsSync()

export function updateThreadActivity(threadId: string): void {
  threadLastMessage.set(threadId, Date.now())
  threadAlertsSent.delete(threadId)
  queuePersistInactiveAlerts()
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

export function markAlertSent(threadId: string, alertType: '48h' | '7d'): void {
  if (!threadAlertsSent.has(threadId)) {
    threadAlertsSent.set(threadId, new Set())
  }
  const alerts = threadAlertsSent.get(threadId)
  if (!alerts) return
  alerts.add(alertType)
  queuePersistInactiveAlerts()
}

export function getAllTrackedThreads(): Array<string> {
  return Array.from(threadLastMessage.keys())
}

export function removeThread(threadId: string): void {
  threadLastMessage.delete(threadId)
  threadAlertsSent.delete(threadId)
  queuePersistInactiveAlerts()
}

export async function initializeThreadActivity(
  thread: ThreadChannel
): Promise<void> {
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
