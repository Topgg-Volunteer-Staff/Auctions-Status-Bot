import {
  Client,
  Partials,
  GatewayIntentBits,
  EmbedBuilder,
  TextChannel,
  ThreadChannel,
  ChannelType,
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'
import startReminders from './utils/status/startReminders'
import commandHandler from './commandHandler'
import { channelIds } from './globals'
import { threadAlerts } from './commands/alert'
import { updateThreadActivity } from './utils/tickets/trackActivity'

const FOUR_IMAGE_LOG_CHANNEL_ID = '1409605702628016261'
const fourImageFlagCounts = new Map<string, number>()

function isImageAttachment(attachment: {
  contentType: string | null
  name: string | null
}): boolean {
  const contentType = (attachment.contentType || '').toLowerCase()
  if (contentType.startsWith('image/')) return true

  const name = (attachment.name || '').toLowerCase()
  return /\.(png|jpe?g|gif|webp|bmp|tiff?)$/.test(name)
}

async function sendFourImageFlagLog(options: {
  userId: string
  userTag: string
  userMention: string
  guildId: string
  guildName: string
  channelId: string
  channelMention: string
  messageId: string
  messageUrl: string
  messageContent: string
  reason: string
  flagCount: number
  attachmentUrls: string[]
  deleted: boolean
}): Promise<void> {
  const logChannel = await client.channels
    .fetch(FOUR_IMAGE_LOG_CHANNEL_ID)
    .catch(() => null)

  if (!logChannel || !logChannel.isTextBased() || !('send' in logChannel)) {
    return
  }

  let collageBuffer: Buffer | null = null
  try {
    collageBuffer = await createFourImageCollage(options.attachmentUrls)
  } catch {
    collageBuffer = null
  }

  const baseEmbed = new EmbedBuilder()
    .setColor('#FFAA00')
    .setTitle('4-image message flagged')
    .setDescription(
      [
        `User: ${options.userMention} (\`${options.userTag}\` | \`${options.userId}\`)`,
        `Channel: ${options.channelMention} (\`${options.channelId}\`)`,
      ].join('\n')
    )
    .addFields(
      { name: 'Reason', value: options.reason, inline: true },
      { name: 'Deleted', value: options.deleted ? 'Yes' : 'No', inline: true },
      { name: 'Flag Count', value: String(options.flagCount), inline: true },
      {
        name: 'Message',
        value: `[Jump](${options.messageUrl}) (\`${options.messageId}\`)`,
        inline: false,
      },
      {
        name: 'Content',
        value: options.messageContent
          ? options.messageContent.slice(0, 1000)
          : '*No content*',
        inline: false,
      },
      {
        name: 'Attachments',
        value:
          options.attachmentUrls.length > 0
            ? options.attachmentUrls
                .slice(0, 10)
                .map((url, idx) => `[${idx + 1}](${url})`)
                .join(' ')
            : '*None*',
        inline: false,
      }
    )
    .setTimestamp()

  const components = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`fourimgBanTemplate_${options.userId}`)
        .setLabel('Get ban template')
        .setStyle(ButtonStyle.Danger)
    ),
  ]

  const files: AttachmentBuilder[] = []
  if (collageBuffer) {
    const collage = new AttachmentBuilder(collageBuffer, {
      name: 'four-images.png',
    })
    files.push(collage)
    baseEmbed.setImage('attachment://four-images.png')
  }

  await (logChannel as any)
    .send({
      embeds: [baseEmbed],
      components,
      files,
      allowedMentions: { parse: [] },
    })
    .catch(() => void 0)
}

async function createFourImageCollage(
  attachmentUrls: string[]
): Promise<Buffer | null> {
  const urls = attachmentUrls.filter(Boolean).slice(0, 4)
  if (urls.length !== 4) return null

  const sharpImport = await import('sharp')
  const sharp = sharpImport.default

  const imageBuffers = await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)
      const arrayBuffer = await res.arrayBuffer()
      return Buffer.from(arrayBuffer)
    })
  )

  const tileSize = 512
  const tiles = await Promise.all(
    imageBuffers.map(async (buf) =>
      sharp(buf)
        .resize(tileSize, tileSize, { fit: 'cover' })
        .png()
        .toBuffer()
    )
  )

  const collage = await sharp({
    create: {
      width: tileSize * 2,
      height: tileSize * 2,
      channels: 4,
      background: { r: 18, g: 18, b: 18, alpha: 1 },
    },
  })
    .composite([
      { input: tiles[0]!, top: 0, left: 0 },
      { input: tiles[1]!, top: 0, left: tileSize },
      { input: tiles[2]!, top: tileSize, left: 0 },
      { input: tiles[3]!, top: tileSize, left: tileSize },
    ])
    .png()
    .toBuffer()

  return collage
}

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

client.on('messageCreate', async (message) => {
  try {
    if (!message.inGuild()) return
    if (message.author.bot) return
    if (message.webhookId) return

    // Only act when there are exactly 4 attachments and all are images.
    if (message.attachments.size !== 4) return
    const attachments = Array.from(message.attachments.values())
    const allImages = attachments.every((a) => isImageAttachment(a))
    if (!allImages) return

    const hasNoContent = !message.content || message.content.trim().length === 0
    const hasEveryonePing =
      message.mentions.everyone || /@everyone\b/i.test(message.content)

    // Delete only if: exactly 4 images AND (empty message OR @everyone ping)
    if (hasNoContent || hasEveryonePing) {
      const reason = hasNoContent
        ? 'Empty message with 4 images'
        : '@everyone ping with 4 images'

      const newCount = (fourImageFlagCounts.get(message.author.id) ?? 0) + 1
      fourImageFlagCounts.set(message.author.id, newCount)

      let deleted = false
      try {
        await message.delete()
        deleted = true
      } catch {
        deleted = false
      }

      const attachmentUrls = attachments
        .map((a) => a.url)
        .filter((u): u is string => typeof u === 'string' && u.length > 0)

      const messageUrl = `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`

      await sendFourImageFlagLog({
        userId: message.author.id,
        userTag: message.author.tag,
        userMention: `<@${message.author.id}>`,
        guildId: message.guildId,
        guildName: message.guild.name,
        channelId: message.channelId,
        channelMention: `<#${message.channelId}>`,
        messageId: message.id,
        messageUrl,
        messageContent: message.content ?? '',
        reason,
        flagCount: newCount,
        attachmentUrls,
        deleted,
      })
    }
  } catch {
    // ignore
  }
})
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

  if (
    thread.parent?.id === channelIds.modTickets &&
    thread.type === ChannelType.PrivateThread &&
    !message.author.bot
  ) {
    updateThreadActivity(thread.id)
  }

  if (
    thread.parent?.id !== channelIds.modTickets ||
    thread.type !== ChannelType.PrivateThread
  ) {
    return
  }

  if (message.author.bot) return

  const threadAlertMap = threadAlerts.get(thread.id)
  if (!threadAlertMap || threadAlertMap.size === 0) return

  try {
    const messageAuthorId = message.author.id
    const modsToNotify: Array<string> = []

    // Check each mod's alert list to see if they're tracking this user
    for (const [modUserId, trackedUserIds] of threadAlertMap.entries()) {
      if (trackedUserIds.has(messageAuthorId)) {
        modsToNotify.push(modUserId)
      }
    }

    if (modsToNotify.length === 0) return

    // Send DMs to all mods who are tracking this user
    for (const modUserId of modsToNotify) {
      try {
        const modUser = await client.users.fetch(modUserId)
        await modUser.send({
          content: `📬 New message from **${message.author.username}** in <#${thread.id}>`,
          allowedMentions: { users: [] },
        })

        // Remove the alert after sending (one-time alert)
        const userAlerts = threadAlertMap.get(modUserId)
        if (userAlerts) {
          userAlerts.delete(messageAuthorId)
          // Clean up empty sets
          if (userAlerts.size === 0) {
            threadAlertMap.delete(modUserId)
          }
        }
      } catch (error) {
        console.error(`Failed to DM mod ${modUserId}:`, error)
        // Still remove the alert even if DM fails
        const userAlerts = threadAlertMap.get(modUserId)
        if (userAlerts) {
          userAlerts.delete(messageAuthorId)
          if (userAlerts.size === 0) {
            threadAlertMap.delete(modUserId)
          }
        }
      }
    }

    // Clean up empty thread alert maps
    if (threadAlertMap.size === 0) {
      threadAlerts.delete(thread.id)
    }
  } catch (error) {
    console.error('Error handling alert message:', error)
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
