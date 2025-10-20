import {
  Client,
  Partials,
  GatewayIntentBits,
  EmbedBuilder,
  TextChannel,
} from 'discord.js'
import startReminders from './utils/status/startReminders'
import commandHandler from './commandHandler'

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
export function createErrorEmbed(title: string, errorData: unknown): EmbedBuilder {
  const errorText =
    errorData instanceof Error
      ? errorData.stack || errorData.message
      : typeof errorData === 'string'
      ? errorData
      : JSON.stringify(errorData, null, 2)

  return new EmbedBuilder()
    .setAuthor({
      name: 'Top.gg Bot',
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
    const channelId = '1403884779408986243'
    console.log(`Attempting to send error to channel ${channelId}`)
    const channel = client.channels.cache.get(channelId)

    if (channel?.isTextBased()) {
      try {
        console.log('Channel found, sending error message...')
        await (channel as TextChannel).send({ embeds: [embed] })
        console.log('Error message sent successfully to channel')
      } catch (sendErr) {
        console.error('Error sending message:', sendErr)
        console.error('Channel permissions or other issues may be preventing message sending')
      }
    } else {
      console.error(
        `Channel with ID ${channelId} not found or is not text-based`
      )
      console.error('Available channels:', client.channels.cache.map(c => ({ id: c.id, type: c.type, name: 'name' in c ? c.name : 'unknown' })))
    }
  } else if (environment === 'PRODUCTION') {
    const webhookUrl =
      'https://discord.com/api/webhooks/1404081951958368288/ozEfqM7v1gCcPdvrQgcvD5txm1tGX8bvpIzSddwQ_osMpk2AQWPrMt2Ye9Z4tZ1QRkfg'
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
  await sendError(createErrorEmbed('uncaughtException', err))
})

process.on('unhandledRejection', async (reason) => {
  console.error('Unhandled rejection:', reason)
  await sendError(createErrorEmbed('unhandledRejection', reason))
})

client.on('error', async (err) => {
  console.error('Client error:', err)
  await sendError(createErrorEmbed('ClientError', err))
})

client.login(process.env.DISCORD_TOKEN)
