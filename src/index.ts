import {
  AuditLogEvent,
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
  isTrackedTicketActivity,
  updateThreadActivity,
} from './utils/tickets/trackActivity'
import {
  initializeTicketDmStore,
  maybeNotifyTicketResponse,
} from './utils/tickets/dmOnResponses'
import { startWebServer } from './utils/webServer'
import {
  initializeStaffTicketReminderStore,
  isStaffUserInGuild,
  maybeHandleStaffTicketReminder,
} from './utils/tickets/staffTicketReminders'
import { initializeTempRoleStore } from './utils/tempRoles'
import { initializeCustomAlertStore } from './utils/customAlert'
import { getResolvedThreadName } from './utils/tickets/resolvedThreadName'
import {
  loadMongoBackedJson,
  saveMongoBackedJson,
  setMongoStoreErrorClient,
} from './utils/db/mongoBackedJsonStore'
import {
  installConsoleErrorForwarding,
  installGlobalErrorHandlers,
  sendMongoErrorLog,
  sendErrorLog,
} from './utils/errorLogging'
import { getBotsForStaffMember } from './utils/verificationCenter/botMembers'

// const FOUR_IMAGE_LOG_CHANNEL_ID = '396848636081733632'
const EXTERNAL_BOT_THREAD_PARENT_ID = '563259383400890388'
const STAFF_ON_BREAK_ROLE_ID = '976592440591024149'
const MODERATORS_CHAT_CHANNEL_ID = '264890171575631873'
const STAFF_BREAK_NOTIFICATION_STORE_KEY = 'staff-break-notifications'
const STAFF_BREAK_EVENT_LOG_LIMIT = 200
const STAFF_BREAK_AUDIT_LOG_WINDOW_MS = 2 * 60 * 1000
const STAFF_BREAK_AUDIT_LOG_ATTEMPTS = 3
const STAFF_BREAK_AUDIT_LOG_RETRY_MS = 1000
// const fourImageFlagCounts = new Map<string, number>()

type StaffBreakNotificationAction =
  | 'sent'
  | 'role-removed'
  | 'observed-existing-role'
  | 'suppressed-already-tracked'
  | 'suppressed-no-audit-log'
  | 'suppressed-untrusted-old-member'

type StaffBreakNotificationRecord = {
  hasBreakRole: boolean
  notifiedAt: number | null
  notificationMessageId: string | null
  lastObservedAt: number
  lastAction: StaffBreakNotificationAction
}

type StaffBreakNotificationEvent = {
  at: number
  userId: string
  username: string
  action: StaffBreakNotificationAction
  reason: string
  oldHadBreakRole: boolean
  newHasBreakRole: boolean
  oldRoleCount: number
  newRoleCount: number
  oldMemberPartial: boolean
  auditLogConfirmed: boolean | null
  messageId: string | null
}

type PersistedStaffBreakNotificationStore = {
  users: Record<string, StaffBreakNotificationRecord>
  events: Array<StaffBreakNotificationEvent>
}

type AuditRoleValue = {
  id?: unknown
}

type AuditRoleChange = {
  key?: unknown
  new?: unknown
}

const staffBreakNotificationRecords = new Map<
  string,
  StaffBreakNotificationRecord
>()
const staffBreakNotificationEvents: Array<StaffBreakNotificationEvent> = []

let staffBreakNotificationInitPromise: Promise<void> | null = null
let staffBreakNotificationWriteChain: Promise<void> = Promise.resolve()

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

function isStaffBreakNotificationAction(
  value: unknown
): value is StaffBreakNotificationAction {
  return (
    value === 'sent' ||
    value === 'role-removed' ||
    value === 'observed-existing-role' ||
    value === 'suppressed-already-tracked' ||
    value === 'suppressed-no-audit-log' ||
    value === 'suppressed-untrusted-old-member'
  )
}

function sanitizeStaffBreakNotificationRecord(
  value: unknown
): StaffBreakNotificationRecord | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<StaffBreakNotificationRecord>
  if (
    typeof candidate.hasBreakRole !== 'boolean' ||
    !isStaffBreakNotificationAction(candidate.lastAction)
  ) {
    return null
  }

  const notifiedAt =
    typeof candidate.notifiedAt === 'number' &&
    Number.isFinite(candidate.notifiedAt)
      ? candidate.notifiedAt
      : null

  const notificationMessageId =
    typeof candidate.notificationMessageId === 'string'
      ? candidate.notificationMessageId
      : null

  const lastObservedAt =
    typeof candidate.lastObservedAt === 'number' &&
    Number.isFinite(candidate.lastObservedAt)
      ? candidate.lastObservedAt
      : Date.now()

  return {
    hasBreakRole: candidate.hasBreakRole,
    notifiedAt,
    notificationMessageId,
    lastObservedAt,
    lastAction: candidate.lastAction,
  }
}

function sanitizeStaffBreakNotificationEvent(
  value: unknown
): StaffBreakNotificationEvent | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<StaffBreakNotificationEvent>
  if (
    typeof candidate.at !== 'number' ||
    !Number.isFinite(candidate.at) ||
    typeof candidate.userId !== 'string' ||
    typeof candidate.username !== 'string' ||
    !isStaffBreakNotificationAction(candidate.action) ||
    typeof candidate.reason !== 'string' ||
    typeof candidate.oldHadBreakRole !== 'boolean' ||
    typeof candidate.newHasBreakRole !== 'boolean' ||
    typeof candidate.oldRoleCount !== 'number' ||
    typeof candidate.newRoleCount !== 'number' ||
    typeof candidate.oldMemberPartial !== 'boolean'
  ) {
    return null
  }

  return {
    at: candidate.at,
    userId: candidate.userId,
    username: candidate.username,
    action: candidate.action,
    reason: candidate.reason,
    oldHadBreakRole: candidate.oldHadBreakRole,
    newHasBreakRole: candidate.newHasBreakRole,
    oldRoleCount: candidate.oldRoleCount,
    newRoleCount: candidate.newRoleCount,
    oldMemberPartial: candidate.oldMemberPartial,
    auditLogConfirmed:
      typeof candidate.auditLogConfirmed === 'boolean'
        ? candidate.auditLogConfirmed
        : null,
    messageId:
      typeof candidate.messageId === 'string' ? candidate.messageId : null,
  }
}

async function initializeStaffBreakNotificationStore(): Promise<void> {
  if (staffBreakNotificationInitPromise) {
    return staffBreakNotificationInitPromise
  }

  staffBreakNotificationInitPromise = (async () => {
    const parsed = await loadMongoBackedJson<unknown>(
      STAFF_BREAK_NOTIFICATION_STORE_KEY,
      { users: {}, events: [] }
    )

    if (!parsed || typeof parsed !== 'object') return

    const store = parsed as Partial<PersistedStaffBreakNotificationStore>

    staffBreakNotificationRecords.clear()
    if (store.users && typeof store.users === 'object') {
      for (const [userId, rawRecord] of Object.entries(store.users)) {
        const record = sanitizeStaffBreakNotificationRecord(rawRecord)
        if (record) staffBreakNotificationRecords.set(userId, record)
      }
    }

    staffBreakNotificationEvents.splice(0, staffBreakNotificationEvents.length)
    if (Array.isArray(store.events)) {
      for (const rawEvent of store.events) {
        const event = sanitizeStaffBreakNotificationEvent(rawEvent)
        if (event) staffBreakNotificationEvents.push(event)
      }
    }

    if (staffBreakNotificationEvents.length > STAFF_BREAK_EVENT_LOG_LIMIT) {
      staffBreakNotificationEvents.splice(
        0,
        staffBreakNotificationEvents.length - STAFF_BREAK_EVENT_LOG_LIMIT
      )
    }
  })()

  return staffBreakNotificationInitPromise
}

async function persistStaffBreakNotificationStore(): Promise<void> {
  const users: Record<string, StaffBreakNotificationRecord> = {}
  for (const [userId, record] of staffBreakNotificationRecords.entries()) {
    users[userId] = record
  }

  await saveMongoBackedJson(
    STAFF_BREAK_NOTIFICATION_STORE_KEY,
    {
      users,
      events: staffBreakNotificationEvents,
    } satisfies PersistedStaffBreakNotificationStore,
    { operation: 'persist' }
  )
}

function queueStaffBreakNotificationPersist(): Promise<void> {
  staffBreakNotificationWriteChain = staffBreakNotificationWriteChain
    .then(() => persistStaffBreakNotificationStore())
    .catch(() => persistStaffBreakNotificationStore())

  return staffBreakNotificationWriteChain
}

function rememberStaffBreakEvent(event: StaffBreakNotificationEvent): void {
  staffBreakNotificationEvents.push(event)
  if (staffBreakNotificationEvents.length > STAFF_BREAK_EVENT_LOG_LIMIT) {
    staffBreakNotificationEvents.splice(
      0,
      staffBreakNotificationEvents.length - STAFF_BREAK_EVENT_LOG_LIMIT
    )
  }

  console.info(
    `[staff-break] ${event.action} user=${event.userId} oldHasBreak=${event.oldHadBreakRole} newHasBreak=${event.newHasBreakRole} oldPartial=${event.oldMemberPartial} audit=${event.auditLogConfirmed} reason=${event.reason}`
  )
}

async function recordStaffBreakNotificationEvent(options: {
  oldMember: GuildMember | PartialGuildMember
  newMember: GuildMember
  action: StaffBreakNotificationAction
  reason: string
  auditLogConfirmed: boolean | null
  messageId: string | null
}): Promise<void> {
  rememberStaffBreakEvent({
    at: Date.now(),
    userId: options.newMember.id,
    username: options.newMember.user.tag,
    action: options.action,
    reason: options.reason,
    oldHadBreakRole: options.oldMember.roles.cache.has(STAFF_ON_BREAK_ROLE_ID),
    newHasBreakRole: options.newMember.roles.cache.has(STAFF_ON_BREAK_ROLE_ID),
    oldRoleCount: options.oldMember.roles.cache.size,
    newRoleCount: options.newMember.roles.cache.size,
    oldMemberPartial: options.oldMember.partial,
    auditLogConfirmed: options.auditLogConfirmed,
    messageId: options.messageId,
  })

  await queueStaffBreakNotificationPersist().catch(() => void 0)
}

function setStaffBreakNotificationRecord(
  userId: string,
  record: StaffBreakNotificationRecord
): void {
  staffBreakNotificationRecords.set(userId, record)
}

function auditChangeAddsBreakRole(change: AuditRoleChange): boolean {
  if (change.key !== '$add' || !Array.isArray(change.new)) return false

  return change.new.some((role: AuditRoleValue) => {
    return (
      role && typeof role === 'object' && role.id === STAFF_ON_BREAK_ROLE_ID
    )
  })
}

async function hasRecentBreakRoleAddAuditLog(
  member: GuildMember
): Promise<boolean | null> {
  for (
    let attempt = 0;
    attempt < STAFF_BREAK_AUDIT_LOG_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const auditLogs = await member.guild.fetchAuditLogs({
        type: AuditLogEvent.MemberRoleUpdate,
        limit: 10,
      })

      const now = Date.now()
      const matchingEntry = auditLogs.entries.find((entry) => {
        if (entry.targetId !== member.id) return false
        if (now - entry.createdTimestamp > STAFF_BREAK_AUDIT_LOG_WINDOW_MS) {
          return false
        }

        return entry.changes.some((change) =>
          auditChangeAddsBreakRole(change as AuditRoleChange)
        )
      })

      if (matchingEntry) return true
    } catch (error) {
      console.error('Failed to fetch audit logs for break-role check:', error)
      return null
    }

    if (attempt < STAFF_BREAK_AUDIT_LOG_ATTEMPTS - 1) {
      await sleep(STAFF_BREAK_AUDIT_LOG_RETRY_MS)
    }
  }

  return false
}

async function maybeNotifyStaffBreakOpenThreads(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember
): Promise<void> {
  await initializeStaffBreakNotificationStore()

  const oldHadBreakRole = oldMember.roles.cache.has(STAFF_ON_BREAK_ROLE_ID)
  const newHasBreakRole = newMember.roles.cache.has(STAFF_ON_BREAK_ROLE_ID)
  const existingRecord = staffBreakNotificationRecords.get(newMember.id)

  if (!newHasBreakRole) {
    if (oldHadBreakRole || existingRecord?.hasBreakRole) {
      setStaffBreakNotificationRecord(newMember.id, {
        hasBreakRole: false,
        notifiedAt: null,
        notificationMessageId: null,
        lastObservedAt: Date.now(),
        lastAction: 'role-removed',
      })

      await recordStaffBreakNotificationEvent({
        oldMember,
        newMember,
        action: 'role-removed',
        reason: 'Break role is no longer present; notification state reset.',
        auditLogConfirmed: null,
        messageId: null,
      })
    }

    return
  }

  if (oldHadBreakRole) {
    setStaffBreakNotificationRecord(newMember.id, {
      hasBreakRole: true,
      notifiedAt: existingRecord?.notifiedAt ?? null,
      notificationMessageId: existingRecord?.notificationMessageId ?? null,
      lastObservedAt: Date.now(),
      lastAction: 'observed-existing-role',
    })

    await recordStaffBreakNotificationEvent({
      oldMember,
      newMember,
      action: 'observed-existing-role',
      reason: 'Old and new member snapshots both include the break role.',
      auditLogConfirmed: null,
      messageId: null,
    })

    return
  }

  if (existingRecord?.hasBreakRole) {
    setStaffBreakNotificationRecord(newMember.id, {
      ...existingRecord,
      lastObservedAt: Date.now(),
      lastAction: 'suppressed-already-tracked',
    })

    await recordStaffBreakNotificationEvent({
      oldMember,
      newMember,
      action: 'suppressed-already-tracked',
      reason:
        'Break role was already tracked as present, so this update is not a new break.',
      auditLogConfirmed: null,
      messageId: null,
    })

    return
  }

  const auditLogConfirmed = await hasRecentBreakRoleAddAuditLog(newMember)

  if (auditLogConfirmed !== true) {
    setStaffBreakNotificationRecord(newMember.id, {
      hasBreakRole: true,
      notifiedAt: null,
      notificationMessageId: null,
      lastObservedAt: Date.now(),
      lastAction: 'suppressed-no-audit-log',
    })

    await recordStaffBreakNotificationEvent({
      oldMember,
      newMember,
      action: 'suppressed-no-audit-log',
      reason:
        auditLogConfirmed === false
          ? 'Member update looked like a break-role add, but no recent audit-log role add matched.'
          : 'Audit-log verification was unavailable, so the break notification was not sent.',
      auditLogConfirmed,
      messageId: null,
    })

    return
  }

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

  const notificationMessage = await moderatorsChat.send({
    content,
    allowedMentions: {
      users: [newMember.id],
      roles: [],
      parse: [],
    },
  })

  setStaffBreakNotificationRecord(newMember.id, {
    hasBreakRole: true,
    notifiedAt: Date.now(),
    notificationMessageId: notificationMessage.id,
    lastObservedAt: Date.now(),
    lastAction: 'sent',
  })

  await recordStaffBreakNotificationEvent({
    oldMember,
    newMember,
    action: 'sent',
    reason: 'Confirmed break-role add notification sent.',
    auditLogConfirmed,
    messageId: notificationMessage.id,
  })
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

  await initializeStaffBreakNotificationStore().catch((error) => {
    void sendMongoErrorLog(
      readyClient,
      'staffBreakNotification.store.init.failed',
      error
    )
  })

  await initializeCustomAlertStore(readyClient).catch((error) => {
    void sendMongoErrorLog(readyClient, 'customAlert.store.init.failed', error)
  })

  await startWebServer().catch((error) => {
    void sendErrorLog(readyClient, 'webServer.startup.failed', error)
  })

  startReminders(readyClient)
})

commandHandler(client)


client.on('threadCreate', async (thread) => {
  if (
    (thread.parent?.id !== channelIds.modTickets &&
      thread.parent?.id !== channelIds.auctionsTickets) ||
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
    (thread.parent?.id === channelIds.modTickets ||
      thread.parent?.id === channelIds.auctionsTickets) &&
    thread.type === ChannelType.PrivateThread &&
    isTrackedTicketActivity(message)
  ) {
    const isStaffAuthor = await isStaffUserInGuild(
      message.guild,
      message.author.id
    )
    await updateThreadActivity(
      thread.id,
      message.createdTimestamp,
      isStaffAuthor
    )
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
    const auctionsTicketsChannel = guild.channels.cache.get(
      channelIds.auctionsTickets
    ) as TextChannel | undefined

    const userThreads: ThreadChannel[] = []

    if (modTicketsChannel) {
      const activeThreads = await modTicketsChannel.threads.fetchActive()
      userThreads.push(
        ...Array.from(activeThreads.threads.values()).filter((thread) =>
          thread.name.endsWith(`- ${member.user.username}`)
        )
      )
    }

    if (auctionsTicketsChannel) {
      const activeThreads = await auctionsTicketsChannel.threads.fetchActive()
      userThreads.push(
        ...Array.from(activeThreads.threads.values()).filter(
          (thread) => thread.name === member.user.username
        )
      )
    }

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
