import {
  Client,
  Partials,
  GatewayIntentBits,
  EmbedBuilder,
  TextChannel,
} from 'discord.js'
import startReminders from './utils/status/startReminders'
import commandHandler from './commandHandler'
import { channelIds } from './globals'

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
  // Development-only: send a test error to verify the errors channel is receiving messages
  if ((process.env.ENVIRONMENT || 'DEVELOPMENT') === 'DEVELOPMENT') {
    setTimeout(() => {
      console.log('Sending development test error to errors channel...')
      try {
        sendError(
          createErrorEmbed('Dev Test Error', 'This is a dev test error.')
        )
      } catch (err) {
        console.error('Failed to send dev test error:', err)
      }
    }, 2000)
    // Also trigger an unhandled rejection to test the unhandledRejection handler
    setTimeout(() => {
      console.log('Triggering an unhandled rejection (dev test)...')
      // Use void to intentionally create an unhandled rejected promise (no catch)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      void Promise.reject(new Error('Dev: test unhandled rejection'))
    }, 4000)
  }
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

client.login(process.env.DISCORD_TOKEN)
