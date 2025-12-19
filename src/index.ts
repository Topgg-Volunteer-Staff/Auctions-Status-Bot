import {
  Client,
  Partials,
  GatewayIntentBits,
  EmbedBuilder,
  TextChannel,
  ThreadChannel,
  ChannelType,
} from 'discord.js'
import startReminders from './utils/status/startReminders'
import commandHandler from './commandHandler'
import { channelIds } from './globals'
import { threadAlerts } from './commands/alert'
import { getTicketCreatorId } from './utils/tickets/getTicketCreator'
import { updateThreadActivity } from './utils/tickets/trackActivity'

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.GuildScheduledEvent,
    Partials.Message,
    Partials.Reaction,
    Partials.ThreadMember,
    Partials.User,
  ],
})

client.on('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}!`)
  client.user?.setPresence({
    status: 'online',
    activities: [{ name: 'the clock!', type: 3 }],
  })
  startReminders(client)
})

commandHandler(client)
/**
 * Creates a standardized error embed for reporting errors.
 */
export function createErrorEmbed(
  title: string,
  errorData: unknown
): EmbedBuilder {
  const errorText =
    errorData instanceof Error
      ? errorData.stack || errorData.message
      : typeof errorData === 'string'
      ? errorData
      : JSON.stringify(errorData, null, 2)

  return new EmbedBuilder()
    .setAuthor({
      name: 'Top.gg Testing',
      iconURL: 'https://i.imgur.com/W2d2UY7.jpeg',
    })
    .setTitle(title)
    .setDescription(
      `An error occurred within the Top.gg Bot\n\`\`\`\n${errorText}\n\`\`\``
    )
    .setTimestamp()
    .setColor('#FF0000')
}

/**
 * Sends an error embed either to a dev channel or via webhook depending on ENVIRONMENT.
 */
export async function sendError(embed: EmbedBuilder): Promise<void> {
  const environment = process.env.ENVIRONMENT || 'DEVELOPMENT'
  console.log(`Current environment: ${environment}`)

  if (environment === 'DEVELOPMENT') {
    const channelId = channelIds.errors
    if (!channelId) {
      console.error('No errors channel configured; aborting sendError')
      return
    }
    console.log(`Attempting to send error to channel ${channelId}`)

    // Try cache first, then fetch as fallback
    let channel = client.channels.cache.get(channelId)
    if (!channel) {
      try {
        channel = await client.channels
          .fetch(channelId)
          .then((c) => c ?? undefined)
          .catch(() => undefined)
      } catch {
        channel = undefined
      }
    }

    if (channel && 'isTextBased' in channel && channel.isTextBased()) {
      try {
        console.log('Channel found, sending error message...')
        await (channel as TextChannel).send({ embeds: [embed] })
        console.log('Error message sent successfully to channel')
      } catch (sendErr) {
        console.error('Error sending message:', sendErr)
        console.error(
          'Channel permissions or other issues may be preventing message sending'
        )
      }
    } else {
      console.error(
        `Channel with ID ${channelId} not found or is not text-based`
      )
      console.error(
        'Available channels:',
        client.channels.cache.map((c) => ({
          id: c.id,
          type: c.type,
          name: 'name' in c ? c.name : 'unknown',
        }))
      )
    }
  } else if (environment === 'PRODUCTION') {
    const webhookUrl = process.env.ERROR_WEBHOOK_URL || ''
    if (!webhookUrl) return
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed.toJSON()] }),
      })
      console.log('Error message sent successfully via webhook')
    } catch (err) {
      console.error('Error sending webhook message:', err)
    }
  }
}

// Global error handlers
process.on('uncaughtException', async (err) => {
  console.error('Caught exception:', err)
  console.log('Attempting to send uncaughtException error...')
  try {
    await sendError(createErrorEmbed('uncaughtException', err))
    console.log('uncaughtException error sent successfully')
  } catch (sendErr) {
    console.error('Failed to send uncaughtException error:', sendErr)
  }
})

process.on('unhandledRejection', async (reason) => {
  console.error('Unhandled rejection:', reason)
  console.log('Attempting to send unhandledRejection error...')
  try {
    await sendError(createErrorEmbed('unhandledRejection', reason))
    console.log('unhandledRejection error sent successfully')
  } catch (sendErr) {
    console.error('Failed to send unhandledRejection error:', sendErr)
  }
})

client.on('error', async (err) => {
  console.error('Client error:', err)
  console.log('Attempting to send client error...')
  try {
    await sendError(createErrorEmbed('ClientError', err))
    console.log('Client error sent successfully')
  } catch (sendErr) {
    console.error('Failed to send client error:', sendErr)
  }
})

client.on('messageCreate', async (message) => {
  if (!message.channel.isThread()) return

  const thread = message.channel as ThreadChannel

  // Track activity for mod tickets and auctions tickets
  if (
    (thread.parent?.id === channelIds.modTickets ||
      thread.parent?.id === channelIds.auctionsTickets) &&
    !message.author.bot
  ) {
    updateThreadActivity(thread.id)
  }

  // Only process mod ticket threads for alerts
  if (
    thread.parent?.id !== channelIds.modTickets ||
    thread.type !== ChannelType.PrivateThread
  ) {
    return
  }

  if (message.author.bot) return

  const alerts = threadAlerts.get(thread.id)
  if (!alerts || alerts.size === 0) return

  try {
    const ticketCreatorId = await getTicketCreatorId(thread)

    if (!ticketCreatorId || message.author.id !== ticketCreatorId) {
      return
    }

    const modUserIdsToRemove: string[] = []

    for (const modUserId of alerts) {
      try {
        const modUser = await client.users.fetch(modUserId)
        await modUser.send({
          content: `📬 New message from **${message.author.username}** in <#${thread.id}>`,
          allowedMentions: { users: [] },
        })
        modUserIdsToRemove.push(modUserId)
      } catch (error) {
        console.error(`Failed to DM mod ${modUserId}:`, error)
        modUserIdsToRemove.push(modUserId)
      }
    }

    for (const modUserId of modUserIdsToRemove) {
      alerts.delete(modUserId)
    }

    if (alerts.size === 0) {
      threadAlerts.delete(thread.id)
    }
  } catch (error) {
    console.error('Error handling ticket creator message:', error)
  }
})

client.on('guildMemberRemove', async (member) => {
  try {
    const guild = member.guild
    const modTicketsChannel = guild.channels.cache.get(
      channelIds.modTickets
    ) as TextChannel | undefined

    if (!modTicketsChannel) return

    const activeThreads = await modTicketsChannel.threads.fetchActive()

    const userThreads = Array.from(activeThreads.threads.values()).filter(
      (thread) => thread.name.endsWith(`- ${member.user.username}`)
    )

    // Post a message in each of the user's active threads
    for (const thread of userThreads) {
      try {
        if (thread.isThread()) {
          await thread.send({
            content: `:warning: <@${member.user.id}> (${member.user.tag} | ${member.id}) has left the server.`,
            allowedMentions: { users: [] },
          })
        }
      } catch (error) {
        console.error(
          `Failed to send leave message in thread ${thread.id}:`,
          error
        )
      }
    }
  } catch (error) {
    console.error('Error in guildMemberRemove handler:', error)
  }
})

client.login(process.env.DISCORD_TOKEN)
