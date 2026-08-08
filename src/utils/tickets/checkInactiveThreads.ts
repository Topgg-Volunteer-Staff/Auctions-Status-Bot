import { Client, TextChannel, ThreadChannel, ChannelType } from 'discord.js'
import { channelIds, resolvedFlag, roleIds } from '../../globals'
import {
  getThreadLastMessage,
  getThreadLastStaffMessage,
  getLast7DayAlertInterval,
  has14DayStaffAlertBeenSent,
  has48HourAlertBeenSent,
  initializeInactiveAlertStore,
  mark14DayStaffAlertSent,
  mark48HourAlertSent,
  mark7DayAlertSent,
  getAllTrackedThreads,
} from './trackActivity'

const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000 // 48 hours in milliseconds
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000

export function getDue7DayAlertInterval(
  timeSinceLastMessage: number,
  lastSentInterval: number
): number | null {
  const currentInterval = Math.floor(timeSinceLastMessage / SEVEN_DAYS)
  return currentInterval >= 1 && currentInterval > lastSentInterval
    ? currentInterval
    : null
}

export function is14DayStaffResponseAlertDue(
  now: number,
  lastStaffActivityAt: number,
  alreadyAlertedForActivity: boolean
): boolean {
  return (
    now - lastStaffActivityAt >= FOURTEEN_DAYS && !alreadyAlertedForActivity
  )
}

// Role -> alert channel routing.
// If a member has multiple roles across routes and it's ambiguous, default to the main alerts channel.
const DEFAULT_ALERT_ROLE_IDS = new Set([
  '364144633451773953',
  '304313580025544704',
  '742408262648987748',
  '695153281105920070',
])

const REVIEWER_ALERT_ROLE_IDS = new Set([
  roleIds.reviewer,
  roleIds.trialReviewer,
])

const ALL_ALERT_ROLE_IDS = new Set([
  ...DEFAULT_ALERT_ROLE_IDS,
  ...REVIEWER_ALERT_ROLE_IDS,
])

type AlertRoute = 'default' | 'reviewers'

export async function checkInactiveThreads(client: Client): Promise<void> {
  await initializeInactiveAlertStore()

  const defaultAlertChannelId = channelIds.inactiveThreadAlerts
  if (!defaultAlertChannelId) {
    console.warn('No inactive thread alerts channel configured')
    return
  }

  const reviewerAlertChannelId = channelIds.inactiveThreadAlertsReviewers

  try {
    const defaultAlertChannel = (await client.channels.fetch(
      defaultAlertChannelId
    )) as TextChannel | null

    if (!defaultAlertChannel) {
      console.error(
        `Inactive thread alerts channel ${defaultAlertChannelId} not found`
      )
      return
    }

    const reviewerAlertChannel =
      reviewerAlertChannelId === defaultAlertChannelId
        ? defaultAlertChannel
        : ((await client.channels.fetch(
            reviewerAlertChannelId
          )) as TextChannel | null)

    if (!reviewerAlertChannel) {
      console.warn(
        `Reviewer inactive thread alerts channel ${reviewerAlertChannelId} not found; falling back to default alerts channel`
      )
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

        const isModTicket = thread?.parent?.id === channelIds.modTickets
        const isAuctionsTicket =
          thread?.parent?.id === channelIds.auctionsTickets

        if (
          !thread ||
          (!isModTicket && !isAuctionsTicket) ||
          thread.type !== ChannelType.PrivateThread ||
          thread.name.startsWith(resolvedFlag)
        ) {
          continue
        }

        const lastStaffMessageTime = getThreadLastStaffMessage(threadId)
        const staffActivityBaseline =
          lastStaffMessageTime ?? thread.createdTimestamp

        if (
          staffActivityBaseline &&
          is14DayStaffResponseAlertDue(
            now,
            staffActivityBaseline,
            has14DayStaffAlertBeenSent(threadId, staffActivityBaseline)
          )
        ) {
          const sent = await sendMissingStaffResponseAlert(
            defaultAlertChannel,
            thread,
            lastStaffMessageTime
          )

          if (sent) {
            await mark14DayStaffAlertSent(threadId, staffActivityBaseline)
          }
        }

        const shouldSend48h =
          isModTicket &&
          timeSinceLastMessage >= FORTY_EIGHT_HOURS &&
          !has48HourAlertBeenSent(threadId)
        const due7DayInterval = isModTicket
          ? getDue7DayAlertInterval(
              timeSinceLastMessage,
              getLast7DayAlertInterval(threadId)
            )
          : null

        const alertToSend: string | null =
          due7DayInterval !== null
            ? `${due7DayInterval * 7}d`
            : shouldSend48h
            ? '2d'
            : null

        const lastRoutedStaff = alertToSend
          ? await getMostActiveRoutedStaffSpeaker(thread)
          : null

        const targetAlertChannel =
          lastRoutedStaff?.route === 'reviewers'
            ? reviewerAlertChannel ?? defaultAlertChannel
            : defaultAlertChannel

        if (alertToSend) {
          await sendInactiveAlert(
            targetAlertChannel,
            thread,
            alertToSend,
            lastRoutedStaff?.memberId ?? null
          )

          if (
            lastRoutedStaff?.isTrialReviewer &&
            reviewerAlertChannel &&
            reviewerAlertChannel.id !== targetAlertChannel.id
          ) {
            await sendInactiveAlert(
              reviewerAlertChannel,
              thread,
              alertToSend,
              lastRoutedStaff.memberId
            )
          }

          if (due7DayInterval !== null) {
            await mark7DayAlertSent(threadId, due7DayInterval)
          } else {
            await mark48HourAlertSent(threadId)
          }
        }
      } catch (error) {
        console.error(`Error checking thread ${threadId}:`, error)
      }
    }
  } catch (error) {
    console.error('Error in checkInactiveThreads:', error)
  }
}

async function sendMissingStaffResponseAlert(
  alertChannel: TextChannel,
  thread: ThreadChannel,
  lastStaffMessageTime: number | null
): Promise<boolean> {
  const activityDescription = lastStaffMessageTime
    ? `The last staff response was <t:${Math.floor(
        lastStaffMessageTime / 1000
      )}:R>.`
    : `No staff member has responded since the ticket was opened <t:${Math.floor(
        (thread.createdTimestamp ?? Date.now()) / 1000
      )}:R>.`

  try {
    await alertChannel.send({
      content:
        `<@&${roleIds.moderator}> :warning: <#${thread.id}> has not received a staff response in 14 days. ` +
        activityDescription,
      allowedMentions: {
        roles: [roleIds.moderator],
        users: [],
        parse: [],
      },
    })
    return true
  } catch (error) {
    console.error('Failed to send 14-day staff response alert:', error)
    return false
  }
}

async function sendInactiveAlert(
  alertChannel: TextChannel,
  thread: ThreadChannel,
  timeSince: string,
  lastStaffMemberId: string | null
): Promise<void> {
  try {
    const handlerPing = lastStaffMemberId
      ? `<@${lastStaffMemberId}> `
      : 'Unknown Staff Member '
    await alertChannel.send(
      `${handlerPing} -> :warning: Please check <#${thread.id}> - inactive since ${timeSince}`
    )
  } catch (error) {
    console.error('Failed to send inactive thread alert:', error)
  }
}

function getMemberAlertRoute(member: {
  roles: { cache: { has: (roleId: string) => boolean } }
}): AlertRoute {
  const hasDefaultRole = Array.from(DEFAULT_ALERT_ROLE_IDS).some((roleId) =>
    member.roles.cache.has(roleId)
  )
  const hasReviewerRole = Array.from(REVIEWER_ALERT_ROLE_IDS).some((roleId) =>
    member.roles.cache.has(roleId)
  )

  // Ambiguous (has roles for both routes) => default channel.
  if (hasReviewerRole && !hasDefaultRole) return 'reviewers'
  return 'default'
}

function getMentionedUserIds(content: string): Array<string> {
  const userIds: Array<string> = []

  for (const match of content.matchAll(/<@!?(\d+)>/g)) {
    const userId = match[1]
    if (userId) {
      userIds.push(userId)
    }
  }

  return userIds
}

async function getAlertEligibleMember(
  thread: ThreadChannel,
  userId: string,
  memberCache: Map<
    string,
    {
      id: string
      roles: { cache: { has: (roleId: string) => boolean } }
    } | null
  >
): Promise<{
  id: string
  roles: { cache: { has: (roleId: string) => boolean } }
} | null> {
  let cachedMember = memberCache.get(userId)
  if (typeof cachedMember === 'undefined') {
    cachedMember = await thread.guild.members.fetch(userId).catch(() => null)
    memberCache.set(userId, cachedMember)
  }

  if (!cachedMember) {
    return null
  }

  const member = cachedMember

  const hasAnyAlertRole = Array.from(ALL_ALERT_ROLE_IDS).some((roleId) =>
    member.roles.cache.has(roleId)
  )

  return hasAnyAlertRole ? member : null
}

async function getMostActiveRoutedStaffSpeaker(thread: ThreadChannel): Promise<{
  memberId: string
  route: AlertRoute
  isTrialReviewer: boolean
} | null> {
  try {
    const staffMessageCounts = new Map<
      string,
      {
        count: number
        latestMessageAt: number
        route: AlertRoute
        isTrialReviewer: boolean
      }
    >()
    const memberCache = new Map<
      string,
      {
        id: string
        roles: { cache: { has: (roleId: string) => boolean } }
      } | null
    >()
    let latestMentionedStaff: {
      memberId: string
      route: AlertRoute
      isTrialReviewer: boolean
      mentionedAt: number
    } | null = null
    let before: string | undefined
    const maxPages = 5

    for (let page = 0; page < maxPages; page++) {
      const fetchOptions: { limit: number; before?: string } = { limit: 100 }
      if (before) fetchOptions.before = before

      const messages = await thread.messages
        .fetch(fetchOptions)
        .catch(() => null)
      if (!messages || messages.size === 0) return null

      for (const message of messages.values()) {
        if (message.author.id === thread.client.user.id) {
          let lastMentionedStaff: {
            id: string
            roles: { cache: { has: (roleId: string) => boolean } }
          } | null = null

          for (const mentionedUserId of getMentionedUserIds(message.content)) {
            const mentionedMember = await getAlertEligibleMember(
              thread,
              mentionedUserId,
              memberCache
            )

            if (mentionedMember) {
              lastMentionedStaff = mentionedMember
            }
          }

          if (
            lastMentionedStaff &&
            (!latestMentionedStaff ||
              message.createdTimestamp > latestMentionedStaff.mentionedAt)
          ) {
            latestMentionedStaff = {
              memberId: lastMentionedStaff.id,
              route: getMemberAlertRoute(lastMentionedStaff),
              isTrialReviewer: lastMentionedStaff.roles.cache.has(
                roleIds.trialReviewer
              ),
              mentionedAt: message.createdTimestamp,
            }
          }

          continue
        }

        if (message.author.bot) continue
        if (message.webhookId) continue
        if (message.system) continue

        const member = await getAlertEligibleMember(
          thread,
          message.author.id,
          memberCache
        )
        if (!member) continue

        const summary = staffMessageCounts.get(member.id) ?? {
          count: 0,
          latestMessageAt: 0,
          route: getMemberAlertRoute(member),
          isTrialReviewer: member.roles.cache.has(roleIds.trialReviewer),
        }

        summary.count += 1
        summary.latestMessageAt = Math.max(
          summary.latestMessageAt,
          message.createdTimestamp
        )

        staffMessageCounts.set(member.id, summary)
      }

      // Next page: fetch older messages
      before = messages.last()?.id
      if (!before || messages.size < 100) break
    }

    let selectedStaff: {
      memberId: string
      route: AlertRoute
      isTrialReviewer: boolean
      count: number
      latestMessageAt: number
    } | null = null

    for (const [memberId, summary] of staffMessageCounts.entries()) {
      if (
        !selectedStaff ||
        summary.count > selectedStaff.count ||
        (summary.count === selectedStaff.count &&
          summary.latestMessageAt > selectedStaff.latestMessageAt)
      ) {
        selectedStaff = {
          memberId,
          route: summary.route,
          isTrialReviewer: summary.isTrialReviewer,
          count: summary.count,
          latestMessageAt: summary.latestMessageAt,
        }
      }
    }

    return selectedStaff
      ? {
          memberId: selectedStaff.memberId,
          route: selectedStaff.route,
          isTrialReviewer: selectedStaff.isTrialReviewer,
        }
      : latestMentionedStaff
      ? {
          memberId: latestMentionedStaff.memberId,
          route: latestMentionedStaff.route,
          isTrialReviewer: latestMentionedStaff.isTrialReviewer,
        }
      : null
  } catch {
    return null
  }
}
