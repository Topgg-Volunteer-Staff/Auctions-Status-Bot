import { ThreadChannel } from 'discord.js'

export async function getTicketCreatorId(
  thread: ThreadChannel
): Promise<string | null> {
  try {
    const messages = await thread.messages.fetch({ limit: 10 })

    const messagesArray = Array.from(messages.values()).reverse()

    for (const message of messagesArray) {
      if (message.system) continue

      const mentions = message.mentions.users
      if (mentions.size > 0) {
        return mentions.first()?.id || null
      }

      const mentionMatch = message.content.match(/<@!?(\d+)>/)
      if (mentionMatch && mentionMatch[1]) {
        return mentionMatch[1]
      }
    }

    return null
  } catch (error) {
    console.error('Error getting ticket creator:', error)
    return null
  }
}
