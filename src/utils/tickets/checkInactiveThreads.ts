import { Client, TextChannel, ThreadChannel, ChannelType } from 'discord.js'
import { channelIds, resolvedFlag } from '../../globals'
import {
  getThreadLastMessage,
  hasAlertBeenSent,
  markAlertSent,
  getAllTrackedThreads,
} from './trackActivity'

const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000 // 48 hours in milliseconds
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds

const HANDLER_ROLE_IDS = new Set(['304313580025544704', '364144633451773953'])

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

        if (
          !thread ||
          thread.archived ||
          thread.parent?.id !== channelIds.modTickets ||
          thread.type !== ChannelType.PrivateThread ||
          thread.name.startsWith(resolvedFlag)
        ) {
          continue
        }

        const shouldSend48h =
          timeSinceLastMessage >= FORTY_EIGHT_HOURS &&
          !hasAlertBeenSent(threadId, '48h')
        const shouldSend7d =
          timeSinceLastMessage >= SEVEN_DAYS && !hasAlertBeenSent(threadId, '7d')

        let lastHandlingModeratorId: string | null = null
        if (shouldSend48h || shouldSend7d) {
          lastHandlingModeratorId = await getLastHandlingModeratorId(thread)
        }

        if (shouldSend48h) {
          await sendInactiveAlert(alertChannel, thread, '2d', lastHandlingModeratorId)
          markAlertSent(threadId, '48h')
        }

        if (shouldSend7d) {
          await sendInactiveAlert(alertChannel, thread, '7d', lastHandlingModeratorId)
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
  timeSince: string,
  lastHandlingModeratorId: string | null
): Promise<void> {
  try {
    const handlerPing = lastHandlingModeratorId
      ? `<@${lastHandlingModeratorId}> `
      : ''
    await alertChannel.send(
      `${handlerPing} -> :warning: Please check <#${thread.id}> - inactive since ${timeSince}`
    )
  } catch (error) {
    console.error('Failed to send inactive thread alert:', error)
  }
}

async function getLastHandlingModeratorId(
  thread: ThreadChannel
): Promise<string | null> {
  try {
    const messages = await thread.messages.fetch({ limit: 100 }).catch(() => null)
    if (!messages) return null

    for (const message of messages.values()) {
      if (!message.author) continue
      if (message.author.bot) continue
      if (message.webhookId) continue
      if (message.system) continue

      const member =
        message.member ??
        (await thread.guild.members.fetch(message.author.id).catch(() => null))

      if (!member) continue
      const hasHandlerRole = Array.from(HANDLER_ROLE_IDS).some((roleId) =>
        member.roles.cache.has(roleId)
      )
      if (!hasHandlerRole) continue

      return member.id
    }

    return null
  } catch {
    return null
  }
}
