import { ThreadChannel } from 'discord.js'

const threadLastMessage = new Map<string, number>()

const threadAlertsSent = new Map<string, Set<'48h' | '7d'>>()

export function updateThreadActivity(threadId: string): void {
  threadLastMessage.set(threadId, Date.now())
  threadAlertsSent.delete(threadId)
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
}

export function getAllTrackedThreads(): Array<string> {
  return Array.from(threadLastMessage.keys())
}

export function removeThread(threadId: string): void {
  threadLastMessage.delete(threadId)
  threadAlertsSent.delete(threadId)
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
