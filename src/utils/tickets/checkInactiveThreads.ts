import { Client, TextChannel, ThreadChannel } from 'discord.js'
import { channelIds } from '../../globals'
import {
  getThreadLastMessage,
  hasAlertBeenSent,
  markAlertSent,
  getAllTrackedThreads,
} from './trackActivity'

const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000 // 48 hours in milliseconds
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds

export async function checkInactiveThreads(client: Client): Promise<void> {
  const alertChannelId = channelIds.inactiveThreadAlerts
  if (!alertChannelId) {
    console.warn('No inactive thread alerts channel configured')
    return
  }

  try {
    const alertChannel = (await client.channels.fetch(
      alertChannelId
    )) as TextChannel | null

    if (!alertChannel) {
      console.error(
        `Inactive thread alerts channel ${alertChannelId} not found`
      )
      return
    }

    const trackedThreadIds = getAllTrackedThreads()
    const now = Date.now()

    for (const threadId of trackedThreadIds) {
      try {
        const lastMessageTime = getThreadLastMessage(threadId)
        if (!lastMessageTime) continue

        const timeSinceLastMessage = now - lastMessageTime

        const thread = (await client.channels
          .fetch(threadId)
          .catch(() => null)) as ThreadChannel | null

        if (!thread || thread.archived) {
          continue
        }

        if (
          timeSinceLastMessage >= FORTY_EIGHT_HOURS &&
          !hasAlertBeenSent(threadId, '48h')
        ) {
          await sendInactiveAlert(alertChannel, thread, '2d')
          markAlertSent(threadId, '48h')
        }

        if (
          timeSinceLastMessage >= SEVEN_DAYS &&
          !hasAlertBeenSent(threadId, '7d')
        ) {
          await sendInactiveAlert(alertChannel, thread, '7d')
          markAlertSent(threadId, '7d')
        }
      } catch (error) {
        console.error(`Error checking thread ${threadId}:`, error)
      }
    }
  } catch (error) {
    console.error('Error in checkInactiveThreads:', error)
  }
}

async function sendInactiveAlert(
  alertChannel: TextChannel,
  thread: ThreadChannel,
  timeSince: string
): Promise<void> {
  try {
    await alertChannel.send(
      `:warning:Please check <#${thread.id}> - inactive since ${timeSince}`
    )
  } catch (error) {
    console.error('Failed to send inactive thread alert:', error)
  }
}
