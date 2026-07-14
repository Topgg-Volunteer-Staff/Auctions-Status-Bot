import {
  Client,
  Partials,
  GatewayIntentBits,
  // EmbedBuilder,
  TextChannel,
  ThreadChannel,
  ChannelType,
  GuildMember,
  PartialGuildMember,
  // ActionRowBuilder,
  // AttachmentBuilder,
  // ButtonBuilder,
  // ButtonStyle,
} from 'discord.js'
import startReminders from './utils/status/startReminders'
import commandHandler from './commandHandler'
import { channelIds, resolvedFlag } from './globals'
import { threadAlerts } from './commands/alert'
import { getOpenThreadsForStaffMember } from './utils/tickets/staffOwnedThreads'
import {
  initializeInactiveAlertStore,
  initializeThreadActivity,
  updateThreadActivity,
} from './utils/tickets/trackActivity'
import {
  initializeTicketDmStore,
  maybeNotifyTicketResponse,
} from './utils/tickets/dmOnResponses'
import {
  initializeStaffTicketReminderStore,
  maybeHandleStaffTicketReminder,
} from './utils/tickets/staffTicketReminders'
import { initializeTempRoleStore } from './utils/tempRoles'
import { getResolvedThreadName } from './utils/tickets/resolvedThreadName'
import {
  // loadMongoBackedJson,
  // saveMongoBackedJson,
  setMongoStoreErrorClient,
} from './utils/db/mongoBackedJsonStore'
import {
  installConsoleErrorForwarding,
  installGlobalErrorHandlers,
  sendMongoErrorLog,
  sendErrorLog,
} from './utils/errorLogging'

// const FOUR_IMAGE_LOG_CHANNEL_ID = '396848636081733632'
const EXTERNAL_BOT_THREAD_PARENT_ID = '563259383400890388'
const STAFF_ON_BREAK_ROLE_ID = '976592440591024149'
const MODERATORS_CHAT_CHANNEL_ID = '264890171575631873'
const VERIFICATION_CENTER_GUILD_ID = '333949691962195969'
// const fourImageFlagCounts = new Map<string, number>()

interface StaffBot {
  id: string
  name: string
}

function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function getEditDistance(left: string, right: string): number {
  const previousRow = Array.from(
    { length: right.length + 1 },
    (_, index) => index
  )

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const currentRow = [leftIndex]

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1

      currentRow[rightIndex] = Math.min(
        (currentRow[rightIndex - 1] ?? 0) + 1,
        (previousRow[rightIndex] ?? 0) + 1,
        (previousRow[rightIndex - 1] ?? 0) + substitutionCost
      )
    }

    previousRow.splice(0, previousRow.length, ...currentRow)
  }

  return previousRow[right.length] ?? Math.max(left.length, right.length)
}

function namesAreSimilar(left: string, right: string): boolean {
  const normalizedLeft = normalizeName(left)
  const normalizedRight = normalizeName(right)

  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return true

  const shorterLength = Math.min(normalizedLeft.length, normalizedRight.length)
  if (
    shorterLength >= 3 &&
    (normalizedLeft.includes(normalizedRight) ||
      normalizedRight.includes(normalizedLeft))
  ) {
    return true
  }

  const longerLength = Math.max(normalizedLeft.length, normalizedRight.length)
  return (
    longerLength >= 4 && getEditDistance(normalizedLeft, normalizedRight) <= 1
  )
}

function getStaffBot(
  member: GuildMember,
  staffNames: Array<string>
): StaffBot | null {
  if (!member.user.bot) return null

  const nameParts = /^\s*(.*?)\s*\|\s*(.+?)\s*$/.exec(member.displayName)
  const ownerUsername = nameParts?.[1]
  const botName = nameParts?.[2]

  if (
    !ownerUsername ||
    !botName ||
    !staffNames.some((staffName) => namesAreSimilar(ownerUsername, staffName))
  ) {
    return null
  }

  return { id: member.id, name: botName }
}

async function getBotsForStaffMember(
  member: GuildMember
): Promise<Array<StaffBot>> {
  const verificationCenter =
    member.client.guilds.cache.get(VERIFICATION_CENTER_GUILD_ID) ??
    (await member.client.guilds
      .fetch(VERIFICATION_CENTER_GUILD_ID)
      .catch(() => null))

  if (!verificationCenter) return []

  const verificationCenterMembers = await verificationCenter.members
    .fetch()
    .catch(() => null)

  if (!verificationCenterMembers) return []

  const staffNames = [
    member.user.username,
    member.user.globalName,
    member.nickname,
  ].filter((name): name is string => Boolean(name))

  return verificationCenterMembers
    .map((verificationCenterMember) =>
      getStaffBot(verificationCenterMember, staffNames)
    )
    .filter((staffBot): staffBot is StaffBot => staffBot !== null)
}

async function maybeNotifyStaffBreakOpenThreads(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember
): Promise<void> {
  const addedRoleIds = newMember.roles.cache.filter(
    (role) => !oldMember.roles.cache.has(role.id)
  )

  if (!addedRoleIds.has(STAFF_ON_BREAK_ROLE_ID)) {
    return
  }

  const moderatorsChat = (await newMember.guild.channels
    .fetch(MODERATORS_CHAT_CHANNEL_ID)
    .catch(() => null)) as TextChannel | null

  if (!moderatorsChat) {
    return
  }

  const [openThreads, staffBots] = await Promise.all([
    getOpenThreadsForStaffMember(newMember.id, newMember.guild),
    getBotsForStaffMember(newMember),
  ])

  const threadSummary = openThreads.length
    ? `Hey, I noticed <@${
        newMember.id
      }> went on break, here are their open threads: ${openThreads
        .map((thread) => `<#${thread.id}>`)
        .join(', ')}.`
    : `Hey, I noticed <@${newMember.id}> went on break, there are no open threads under them.`

  const botSummary = staffBots.length
    ? `\nI also noticed they have ${
        staffBots.length === 1 ? 'a bot' : 'bots'
      } ${staffBots
        .map((bot) => `"${bot.name}" (${bot.id})`)
        .join(', ')} in the VC.`
    : `\nAnd they don't have any bots in the VC either.`

  const content = `${threadSummary}${botSummary}\n\nhope they enjoy their break :saluting_face:`

  await moderatorsChat.send({
    content,
    allowedMentions: {
      users: [newMember.id],
      roles: [],
      parse: [],
    },
  })
}

// const FOUR_IMAGE_FLAGS_STORE_KEY = 'four-image-flags'

// let fourImageFlagsInitPromise: Promise<void> | null = null
// let fourImageFlagsWriteChain: Promise<void> = Promise.resolve()

// function initFourImageFlagsStore(): Promise<void> {
//   if (fourImageFlagsInitPromise) return fourImageFlagsInitPromise

//   fourImageFlagsInitPromise = (async () => {
//     try {
//       const parsed = await loadMongoBackedJson<unknown>(
//         FOUR_IMAGE_FLAGS_STORE_KEY,
//         {}
//       )
//       if (!parsed || typeof parsed !== 'object') return

//       fourImageFlagCounts.clear()

//       for (const [userId, count] of Object.entries(parsed)) {
//         if (typeof userId !== 'string') continue
//         if (typeof count !== 'number' || !Number.isFinite(count)) continue
//         if (count <= 0) continue
//         fourImageFlagCounts.set(userId, Math.floor(count))
//       }
//     } catch (err) {
//       const maybe = err as { code?: unknown }
//       if (maybe.code !== 'ENOENT') {
//         console.error('Failed to load four-image flag counts:', err)
//       }
//     }
//   })()

//   return fourImageFlagsInitPromise
// }

// async function persistFourImageFlagsStore(): Promise<void> {
//   await initFourImageFlagsStore()

//   const obj: Record<string, number> = {}
//   for (const [userId, count] of fourImageFlagCounts.entries()) {
//     obj[userId] = count
//   }
//   await saveMongoBackedJson(FOUR_IMAGE_FLAGS_STORE_KEY, obj, {
//     operation: 'persist',
//   })
// }

// function queuePersistFourImageFlagsStore(): Promise<void> {
//   fourImageFlagsWriteChain = fourImageFlagsWriteChain
//     .then(() => persistFourImageFlagsStore())
//     .catch(() => persistFourImageFlagsStore())
//   return fourImageFlagsWriteChain
// }

// function isImageAttachment(attachment: {
//   contentType: string | null
//   name: string | null
// }): boolean {
//   const contentType = (attachment.contentType || '').toLowerCase()
//   if (contentType.startsWith('image/')) return true

//   const name = (attachment.name || '').toLowerCase()
//   return /\.(png|jpe?g|gif|webp|bmp|tiff?)$/.test(name)
// }

// type SendableChannel = {
//   send: (options: unknown) => Promise<unknown>
// }

// function isSendableChannel(channel: unknown): channel is SendableChannel {
//   if (!channel || typeof channel !== 'object') return false
//   const maybe = channel as { send?: unknown }
//   return typeof maybe.send === 'function'
// }

// (Attachment link editing removed; we only show the collage now.)

// async function sendFourImageFlagLog(options: {
//   userId: string
//   userTag: string
//   userMention: string
//   guildId: string
//   guildName: string
//   channelId: string
//   channelMention: string
//   messageId: string
//   messageUrl: string
//   messageContent: string
//   reason: string
//   flagCount: number
//   attachmentUrls: Array<string>
//   attachmentBuffers?: Array<Buffer>
//   deleted: boolean
// }): Promise<void> {
//   const logChannel = await client.channels
//     .fetch(FOUR_IMAGE_LOG_CHANNEL_ID)
//     .catch(() => null)

//   if (!logChannel || !isSendableChannel(logChannel)) {
//     return
//   }

//   const sendableChannel = logChannel

//   const fields = [
//     { name: 'Reason', value: options.reason, inline: true },
//     { name: 'Deleted', value: options.deleted ? 'Yes' : 'No', inline: true },
//     { name: 'Flag Count', value: String(options.flagCount), inline: true },
//     {
//       name: 'Message',
//       value: `[Jump](${options.messageUrl}) (\`${options.messageId}\`)`,
//       inline: false,
//     },
//     {
//       name: 'Content',
//       value: options.messageContent
//         ? options.messageContent.slice(0, 1000)
//         : '*No content*',
//       inline: false,
//     },
//   ] satisfies Array<{
//     name: string
//     value: string
//     inline?: boolean
//   }>

//   const baseEmbed = new EmbedBuilder()
//     .setColor('#FFAA00')
//     .setTitle('4-image message flagged')
//     .setDescription(
//       [
//         `User: ${options.userMention} (\`${options.userTag}\` | \`${options.userId}\`)`,
//         `Channel: ${options.channelMention} (\`${options.channelId}\`)`,
//       ].join('\n')
//     )
//     .setFields(fields)
//     .setTimestamp()

//   const components = [
//     new ActionRowBuilder<ButtonBuilder>().addComponents(
//       new ButtonBuilder()
//         .setCustomId(`fourimgBanTemplate_${options.userId}`)
//         .setLabel('Get ban template')
//         .setStyle(ButtonStyle.Danger)
//     ),
//   ]

//   const files: Array<AttachmentBuilder> = []
//   // Attach the 4 raw images as message attachments (not inside the embed).
//   const rawBuffers: Array<Buffer> = []
//   if (options.attachmentBuffers && options.attachmentBuffers.length > 0) {
//     rawBuffers.push(
//       ...options.attachmentBuffers.filter((b): b is Buffer =>
//         Buffer.isBuffer(b)
//       )
//     )
//   } else {
//     const urls = options.attachmentUrls.filter(Boolean).slice(0, 4)
//     if (urls.length > 0) {
//       const fetched = await Promise.all(urls.map(fetchImageBuffer))
//       rawBuffers.push(
//         ...fetched.filter((b): b is Buffer => Boolean(b) && Buffer.isBuffer(b))
//       )
//     }
//   }

//   if (rawBuffers.length > 0) {
//     rawBuffers.slice(0, 4).forEach((buf, idx) => {
//       files.push(new AttachmentBuilder(buf, { name: `image-${idx + 1}.png` }))
//     })
//   }

//   if (files.length === 0) {
//     console.warn(
//       `[four-image] no images could be attached (node=${
//         process.version
//       }, hasFetch=${
//         typeof (globalThis as unknown as { fetch?: unknown }).fetch ===
//         'function'
//       })`
//     )
//   }

//   try {
//     await sendableChannel.send({
//       embeds: [baseEmbed],
//       components,
//       files,
//       allowedMentions: { parse: [] },
//     })
//   } catch {
//     // If attaching fails (most commonly due to size limits), fall back to logging links.
//     const urlList = options.attachmentUrls.filter(Boolean).slice(0, 4)
//     if (urlList.length > 0) {
//       baseEmbed.addFields({
//         name: 'Attachments',
//         value: urlList
//           .map((u, i) => `${i + 1}. ${u}`)
//           .join('\n')
//           .slice(0, 1024),
//         inline: false,
//       })
//     }

//     await sendableChannel
//       .send({
//         embeds: [baseEmbed],
//         components,
//         allowedMentions: { parse: [] },
//       })
//       .catch((error) => {
//         void sendErrorLog(client, 'fourImage.logSend.fallback.failed', error, {
//           messageId: options.messageId,
//           channelId: options.channelId,
//         })
//       })
//   }
// }

// async function fetchImageBuffer(url: string): Promise<Buffer | null> {
//   try {
//     const fetchFn =
//       typeof (globalThis as unknown as { fetch?: unknown }).fetch === 'function'
//         ? (globalThis as unknown as { fetch: typeof fetch }).fetch
//         : (await import('node-fetch')).default

//     const controller = new AbortController()
//     const timeout = setTimeout(() => controller.abort(), 10_000)

//     const res = await fetchFn(url, {
//       signal: controller.signal,
//       headers: {
//         // Some environments/CDNs behave better with an explicit UA.
//         'user-agent': 'TopGG-Tickets/1.0 (+https://top.gg)',
//       },
//     })
//     clearTimeout(timeout)
//     if (!res.ok) return null
//     const arrayBuffer = await res.arrayBuffer()
//     return Buffer.from(arrayBuffer)
//   } catch {
//     return null
//   }
// }

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

setMongoStoreErrorClient(client)

installConsoleErrorForwarding(client)
installGlobalErrorHandlers(client)

// void initFourImageFlagsStore().catch((error) => {
//   void sendErrorLog(client, 'fourImage.init.failed', error)
// })

client.on('clientReady', async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}!`)
  readyClient.user.setPresence({
    status: 'online',
    activities: [{ name: 'the clock!', type: 3 }],
  })

  await initializeTicketDmStore(readyClient).catch((error) => {
    void sendMongoErrorLog(readyClient, 'ticketDm.store.init.failed', error)
  })

  await initializeStaffTicketReminderStore(readyClient).catch((error) => {
    void sendMongoErrorLog(
      readyClient,
      'staffTicketReminder.store.init.failed',
      error
    )
  })

  await initializeInactiveAlertStore().catch((error) => {
    void sendMongoErrorLog(
      readyClient,
      'inactiveAlerts.store.init.failed',
      error
    )
  })

  await initializeTempRoleStore(readyClient).catch((error) => {
    void sendMongoErrorLog(readyClient, 'tempRole.store.init.failed', error)
  })

  startReminders(readyClient)
})

commandHandler(client)

// disabling as moving to TopDogg
// client.on('messageCreate', async (message) => {
//   try {
//     if (!message.inGuild()) return
//     if (message.author.bot) return
//     if (message.webhookId) return

//     await initFourImageFlagsStore()

//     // Only act when there are exactly 4 attachments and all are images.
//     if (message.attachments.size !== 4) return
//     const attachments = Array.from(message.attachments.values())
//     const allImages = attachments.every((a) => isImageAttachment(a))
//     if (!allImages) return

//     const hasNoContent = !message.content || message.content.trim().length === 0
//     const hasEveryonePing =
//       message.mentions.everyone || /@everyone\b/i.test(message.content)

//     // Delete only if: exactly 4 images AND (empty message OR @everyone ping)
//     if (hasNoContent || hasEveryonePing) {
//       const reason = hasNoContent
//         ? 'Empty message with 4 images'
//         : '@everyone ping with 4 images'

//       const newCount = (fourImageFlagCounts.get(message.author.id) ?? 0) + 1
//       fourImageFlagCounts.set(message.author.id, newCount)
//       await queuePersistFourImageFlagsStore().catch((error) => {
//         void sendErrorLog(client, 'fourImage.persist.failed', error, {
//           userId: message.author.id,
//         })
//       })

//       const attachmentUrls = attachments
//         .map((a) => a.url)
//         .filter((u): u is string => typeof u === 'string' && u.length > 0)

//       // Fetch attachment bytes BEFORE deleting the message so we can always build/upload the collage.
//       const preDeleteBuffers = await Promise.all(
//         attachmentUrls.slice(0, 4).map(fetchImageBuffer)
//       )
//       const attachmentBuffers = preDeleteBuffers.every(
//         (b): b is Buffer => Boolean(b) && Buffer.isBuffer(b)
//       )
//         ? preDeleteBuffers
//         : undefined

//       let deleted = false
//       try {
//         await message.delete()
//         deleted = true
//       } catch (error) {
//         deleted = false
//         void sendErrorLog(client, 'fourImage.delete.failed', error, {
//           messageId: message.id,
//           channelId: message.channelId,
//         })
//       }

//       const messageUrl = `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`

//       await sendFourImageFlagLog({
//         userId: message.author.id,
//         userTag: message.author.tag,
//         userMention: `<@${message.author.id}>`,
//         guildId: message.guildId,
//         guildName: message.guild.name,
//         channelId: message.channelId,
//         channelMention: `<#${message.channelId}>`,
//         messageId: message.id,
//         messageUrl,
//         messageContent: message.content,
//         reason,
//         flagCount: newCount,
//         attachmentUrls,
//         ...(attachmentBuffers ? { attachmentBuffers } : {}),
//         deleted,
//       })
//     }
//   } catch (error) {
//     void sendErrorLog(client, 'fourImage.handler.failed', error)
//   }
// })

client.on('threadCreate', async (thread) => {
  if (
    thread.parent?.id !== channelIds.modTickets ||
    thread.type !== ChannelType.PrivateThread ||
    thread.name.startsWith(resolvedFlag)
  ) {
    return
  }

  await initializeThreadActivity(thread).catch((error) => {
    console.error(
      `Failed to initialize new thread activity for ${thread.id}:`,
      error
    )
    void sendErrorLog(client, 'thread.initialize.failed', error, {
      threadId: thread.id,
      parentId: thread.parentId ?? 'unknown',
    })
  })
})

client.on('messageCreate', async (message) => {
  await maybeNotifyTicketResponse(message).catch((error) => {
    console.error('Failed to process ticket DM response notification:', error)
  })

  await maybeHandleStaffTicketReminder(message).catch((error) => {
    console.error('Failed to process staff ticket reminder:', error)
  })
})

client.on('messageCreate', async (message) => {
  if (!message.channel.isThread()) return

  const thread = message.channel as ThreadChannel

  if (
    thread.parent?.id === channelIds.modTickets &&
    thread.type === ChannelType.PrivateThread &&
    !message.author.bot
  ) {
    await updateThreadActivity(thread.id)
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

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    await maybeNotifyStaffBreakOpenThreads(oldMember, newMember)
  } catch (error) {
    console.error('Error in guildMemberUpdate break-role handler:', error)
  }
})

client.on('messageCreate', async (message) => {
  if (!message.inGuild()) return
  if (message.author.bot) return
  if (message.content.trim().toLowerCase() !== '-resolve') return
  if (!message.channel.isThread()) return

  const thread = message.channel as ThreadChannel
  if (thread.parentId !== EXTERNAL_BOT_THREAD_PARENT_ID) return

  try {
    if (!thread.name.startsWith(resolvedFlag)) {
      await thread.setName(getResolvedThreadName(thread.name))
    }

    await thread.setLocked(true, 'Resolved via prefix command')
    await thread.setArchived(true, 'Resolved via prefix command')
  } catch (error) {
    console.error('Failed to resolve external bot thread:', error)
    await message.reply('I could not resolve this thread. Please try again.')
  }
})

client.login(process.env.DISCORD_TOKEN)
