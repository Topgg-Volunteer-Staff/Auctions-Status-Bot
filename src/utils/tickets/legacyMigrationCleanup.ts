import { Message, ThreadChannel } from 'discord.js'
import { resolvedFlag } from '../../globals'
import { getResolvedThreadName } from './resolvedThreadName'
import { removeThread } from './trackActivity'

const RECENT_MESSAGE_LIMIT = 10
const CLEANUP_BATCH_SIZE = 100
const CLEANUP_REQUEST_DELAY_MS = 250

const queuedThreads = new Map<string, ThreadChannel>()
let cleanupInProgress = false

function collectText(value: unknown, output: Array<string>): void {
  if (typeof value === 'string') {
    output.push(value)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) collectText(item, output)
    return
  }

  if (!value || typeof value !== 'object') return

  const serializable = value as { toJSON?: () => unknown }
  if (typeof serializable.toJSON === 'function') {
    collectText(serializable.toJSON(), output)
    return
  }

  for (const item of Object.values(value as Record<string, unknown>)) {
    collectText(item, output)
  }
}

export function hasTicketMovedNotice(message: {
  content?: string
  components?: ReadonlyArray<unknown>
  embeds?: ReadonlyArray<unknown>
}): boolean {
  const text: Array<string> = []
  collectText(message.content, text)
  collectText(message.components, text)
  collectText(message.embeds, text)

  const normalizedText = text.join('\n').toLowerCase()
  return (
    normalizedText.includes('ticket moved') &&
    normalizedText.includes('please continue in')
  )
}

function isMigrationNoticeFromThisBot(
  message: Message,
  thread: ThreadChannel
): boolean {
  return (
    message.author.id === thread.client.user.id && hasTicketMovedNotice(message)
  )
}

async function hasRecentMigrationNotice(
  thread: ThreadChannel
): Promise<boolean> {
  const messages = await thread.messages.fetch({ limit: RECENT_MESSAGE_LIMIT })
  return [...messages.values()].some((message) =>
    isMigrationNoticeFromThisBot(message, thread)
  )
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export function enqueueLegacyMigrationCheck(thread: ThreadChannel): void {
  if (thread.name.startsWith(resolvedFlag)) return
  queuedThreads.set(thread.id, thread)
}

export async function setResolvedNamePreservingArchiveState(
  thread: ThreadChannel
): Promise<void> {
  if (thread.name.startsWith(resolvedFlag)) return

  const wasArchived = thread.archived
  if (wasArchived) {
    await thread.setArchived(false, 'Updating legacy migrated ticket name')
  }

  let updateError: unknown
  try {
    await thread.setName(getResolvedThreadName(thread.name))
  } catch (error) {
    updateError = error
  }

  if (wasArchived) {
    try {
      await thread.setArchived(true, 'Legacy migrated ticket updated')
    } catch (error) {
      updateError ??= error
    }
  }

  if (updateError) throw updateError
}

export async function processLegacyMigrationCleanupBatch(): Promise<void> {
  if (cleanupInProgress || queuedThreads.size === 0) return
  cleanupInProgress = true

  try {
    const batch = [...queuedThreads.values()].slice(0, CLEANUP_BATCH_SIZE)

    for (const thread of batch) {
      queuedThreads.delete(thread.id)

      try {
        // A prior attempt may have renamed successfully but failed while
        // restoring the archived state. Finish that cleanup without rescanning.
        if (thread.name.startsWith(resolvedFlag)) {
          if (thread.locked && !thread.archived) {
            await thread.setArchived(true, 'Legacy migrated ticket updated')
          }
          await removeThread(thread.id)
          continue
        }

        if (await hasRecentMigrationNotice(thread)) {
          await setResolvedNamePreservingArchiveState(thread)
          await removeThread(thread.id)
        }
      } catch (error) {
        // Retry temporary Discord/API failures during a later upkeep pass.
        queuedThreads.set(thread.id, thread)
        console.error(
          `Failed to inspect legacy migrated ticket ${thread.id}:`,
          error
        )
      }

      if (queuedThreads.size > 0) {
        await wait(CLEANUP_REQUEST_DELAY_MS)
      }
    }
  } finally {
    cleanupInProgress = false
  }
}
