import { Client, Guild, GuildMember, Message, ThreadChannel } from 'discord.js'

import { roleIds } from '../../globals'
import { recordResolvedTicket } from '../db/resolvedTickets'
import { sendMongoErrorLog } from '../errorLogging'

type RecordResolvedTicketCreditOptions = {
  client: Client
  command: string
  guildId: string
  parentId: string | null
  resolvedAt: Date
  resolvedByUserId: string
  threadId: string
  threadName: string
}

type StaffActivity = {
  count: number
  lastMessageTimestamp: number
}

const eligibleResolvedCreditRoleIds = new Set<string>([
  roleIds.moderator,
  roleIds.reviewer,
  roleIds.trialReviewer,
])

const hasEligibleResolvedCreditRole = (member: GuildMember): boolean =>
  member.roles.cache.some((role) => eligibleResolvedCreditRoleIds.has(role.id))

const fetchAllThreadMessages = async (
  thread: ThreadChannel
): Promise<Array<Message<true>>> => {
  const messages: Array<Message<true>> = []
  let before: string | undefined

  for (;;) {
    const batch = await thread.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    })

    if (batch.size === 0) {
      break
    }

    messages.push(...batch.values())

    if (batch.size < 100) {
      break
    }

    before = batch.lastKey()
    if (!before) {
      break
    }
  }

  return messages
}

const getMemberForMessage = async (
  guild: Guild,
  message: Message<true>,
  memberCache: Map<string, GuildMember | null>
): Promise<GuildMember | null> => {
  const cachedMember = memberCache.get(message.author.id)
  if (cachedMember !== undefined) {
    return cachedMember
  }

  const memberFromMessage = message.member ?? null
  if (memberFromMessage) {
    memberCache.set(message.author.id, memberFromMessage)
    return memberFromMessage
  }

  const fetchedMember = await guild.members.fetch(message.author.id).catch(() => null)
  memberCache.set(message.author.id, fetchedMember)
  return fetchedMember
}

export const getMostActiveStaffMemberId = async (
  thread: ThreadChannel
): Promise<string | null> => {
  if (!thread.guild) {
    return null
  }

  const messages = await fetchAllThreadMessages(thread)
  const memberCache = new Map<string, GuildMember | null>()
  const activityByUserId = new Map<string, StaffActivity>()

  for (const message of messages) {
    if (message.system || message.author.bot) {
      continue
    }

    const member = await getMemberForMessage(thread.guild, message, memberCache)
    if (!member || !hasEligibleResolvedCreditRole(member)) {
      continue
    }

    const existing = activityByUserId.get(member.id)
    const timestamp = message.createdTimestamp

    if (existing) {
      existing.count += 1
      existing.lastMessageTimestamp = Math.max(
        existing.lastMessageTimestamp,
        timestamp
      )
      continue
    }

    activityByUserId.set(member.id, {
      count: 1,
      lastMessageTimestamp: timestamp,
    })
  }

  let selectedUserId: string | null = null
  let selectedActivity: StaffActivity | null = null

  for (const [userId, activity] of activityByUserId.entries()) {
    if (!selectedActivity) {
      selectedUserId = userId
      selectedActivity = activity
      continue
    }

    if (activity.count > selectedActivity.count) {
      selectedUserId = userId
      selectedActivity = activity
      continue
    }

    if (
      activity.count === selectedActivity.count &&
      activity.lastMessageTimestamp > selectedActivity.lastMessageTimestamp
    ) {
      selectedUserId = userId
      selectedActivity = activity
    }
  }

  return selectedUserId
}

export const recordResolvedTicketCredit = async (
  options: RecordResolvedTicketCreditOptions
): Promise<void> => {
  await recordResolvedTicket({
    threadId: options.threadId,
    threadName: options.threadName,
    resolvedAt: options.resolvedAt,
    resolvedByUserId: options.resolvedByUserId,
  }).catch((error) => {
    console.error(
      `Failed to record resolved ticket ${options.threadId} in MongoDB:`,
      error
    )

    return sendMongoErrorLog(
      options.client,
      `${options.command}.recordResolvedTicket.failed`,
      error,
      {
        threadId: options.threadId,
        threadName: options.threadName,
        parentId: options.parentId,
        guildId: options.guildId,
        resolvedByUserId: options.resolvedByUserId,
        command: options.command,
      }
    ).catch((logError) => {
      console.error(
        `Failed to send resolve DB error log for thread ${options.threadId}:`,
        logError
      )
    })
  })
}