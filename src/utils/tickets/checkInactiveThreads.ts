import { Client, TextChannel, ThreadChannel, ChannelType } from 'discord.js'
import { channelIds, resolvedFlag, roleIds } from '../../globals'
import {
  getThreadLastMessage,
  getThreadLastStaffMessage,
  getLast7DayAlertInterval,
  isWeeklyReminderCycleEnrolled,
  has14DayStaffAlertBeenSent,
  has48HourAlertBeenSent,
  initializeInactiveAlertStore,
  mark14DayStaffAlertsSent,
  mark48HourAlertSent,
  mark7DayAlertSent,
  getAllTrackedThreads,
  removeThread,
} from './trackActivity'
import {
  enqueueLegacyMigrationCheck,
  processLegacyMigrationCleanupBatch,
} from './legacyMigrationCleanup'
import { getTicketCategory, type TicketCategory } from './staffOwnedThreads'

const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000 // 48 hours in milliseconds
const INACTIVE_ALERT_WINDOW = 24 * 60 * 60 * 1000
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000
const STAFF_RESPONSE_ALERT_WINDOW = 24 * 60 * 60 * 1000
const MAX_MISSING_STAFF_ALERT_DETAILS = 15

type MissingStaffResponseAlert = {
  threadId: string
  staffActivityBaseline: number
  lastStaffMessageTime: number | null
  threadCreatedTimestamp: number
}

let inactiveThreadCheckInProgress = false

export function getDue7DayAlertInterval(
  timeSinceLastMessage: number,
  lastSentInterval: number,
  cycleEnrolled: boolean
): number | null {
  const currentInterval = Math.floor(timeSinceLastMessage / SEVEN_DAYS)
  const currentIntervalStartedAt = currentInterval * SEVEN_DAYS
  const enteredCurrentIntervalWithinAlertWindow =
    timeSinceLastMessage < currentIntervalStartedAt + INACTIVE_ALERT_WINDOW

  return currentInterval >= 1 &&
    cycleEnrolled &&
    enteredCurrentIntervalWithinAlertWindow &&
    currentInterval > lastSentInterval
    ? currentInterval
    : null
}

export function is48HourAlertDue(
  timeSinceLastMessage: number,
  alreadyAlerted: boolean
): boolean {
  return (
    timeSinceLastMessage >= FORTY_EIGHT_HOURS &&
    timeSinceLastMessage < FORTY_EIGHT_HOURS + INACTIVE_ALERT_WINDOW &&
    !alreadyAlerted
  )
}

export function is14DayStaffResponseAlertDue(
  now: number,
  lastStaffActivityAt: number,
  alreadyAlertedForActivity: boolean
): boolean {
  const timeSinceLastStaffActivity = now - lastStaffActivityAt

  return (
    timeSinceLastStaffActivity >= FOURTEEN_DAYS &&
    timeSinceLastStaffActivity < FOURTEEN_DAYS + STAFF_RESPONSE_ALERT_WINDOW &&
    !alreadyAlertedForActivity
  )
}

export function shouldSend14DayStaffResponseAlertForCategory(
  category: TicketCategory
): boolean {
  return category === 'Reviewer'
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
  if (inactiveThreadCheckInProgress) {
    console.warn('Skipping overlapping inactive thread check')
    return
  }

  inactiveThreadCheckInProgress = true

  try {
    await runInactiveThreadCheck(client)
  } finally {
    inactiveThreadCheckInProgress = false
  }
}

async function runInactiveThreadCheck(client: Client): Promise<void> {
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
    const missingStaffResponseAlerts: Array<MissingStaffResponseAlert> = []

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

        if (thread?.locked) {
          enqueueLegacyMigrationCheck(thread)
          await removeThread(threadId)
          continue
        }

        if (!thread) {
          continue
        }

        if (
          (!isModTicket && !isAuctionsTicket) ||
          thread.type !== ChannelType.PrivateThread ||
          thread.name.startsWith(resolvedFlag)
        ) {
          await removeThread(threadId)
          continue
        }

        const lastStaffMessageTime = getThreadLastStaffMessage(threadId)
        const staffActivityBaseline =
          lastStaffMessageTime ?? thread.createdTimestamp
        const shouldCheck14DayStaffResponse =
          shouldSend14DayStaffResponseAlertForCategory(
            getTicketCategory(thread)
          )

        if (
          shouldCheck14DayStaffResponse &&
          staffActivityBaseline &&
          is14DayStaffResponseAlertDue(
            now,
            staffActivityBaseline,
            has14DayStaffAlertBeenSent(threadId, staffActivityBaseline)
          )
        ) {
          missingStaffResponseAlerts.push({
            threadId,
            staffActivityBaseline,
            lastStaffMessageTime,
            threadCreatedTimestamp:
              thread.createdTimestamp ?? staffActivityBaseline,
          })
        }

        const shouldSend48h =
          isModTicket &&
          is48HourAlertDue(
            timeSinceLastMessage,
            has48HourAlertBeenSent(threadId)
          )
        const due7DayInterval = isModTicket
          ? getDue7DayAlertInterval(
              timeSinceLastMessage,
              getLast7DayAlertInterval(threadId),
              isWeeklyReminderCycleEnrolled(threadId, lastMessageTime)
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
          let alertsSent = await sendInactiveAlert(
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
            const reviewerAlertSent = await sendInactiveAlert(
              reviewerAlertChannel,
              thread,
              alertToSend,
              lastRoutedStaff.memberId
            )
            alertsSent = alertsSent && reviewerAlertSent
          }

          if (!alertsSent) {
            continue
          } else if (due7DayInterval !== null) {
            await mark7DayAlertSent(threadId, due7DayInterval)
          } else {
            await mark48HourAlertSent(threadId)
          }
        }
      } catch (error) {
        console.error(`Error checking thread ${threadId}:`, error)
      }
    }

    if (missingStaffResponseAlerts.length > 0) {
      const sent = await sendMissingStaffResponseAlerts(
        defaultAlertChannel,
        missingStaffResponseAlerts
      )

      if (sent) {
        await mark14DayStaffAlertsSent(
          missingStaffResponseAlerts.map(
            ({ threadId, staffActivityBaseline }) => ({
              threadId,
              staffActivityAt: staffActivityBaseline,
            })
          )
        )
      }
    }

    await processLegacyMigrationCleanupBatch()
  } catch (error) {
    console.error('Error in checkInactiveThreads:', error)
  }
}

export function buildMissingStaffResponseAlertContent(
  alerts: Array<MissingStaffResponseAlert>,
  maxDetails = MAX_MISSING_STAFF_ALERT_DETAILS
): string {
  const displayedAlerts = alerts.slice(0, Math.max(0, maxDetails))
  const ticketLabel = alerts.length === 1 ? 'ticket has' : 'tickets have'
  const lines = [
    `:warning: ${alerts.length} open ${ticketLabel} not received a staff response in 14 days.`,
  ]

  for (const alert of displayedAlerts) {
    const activityDescription = alert.lastStaffMessageTime
      ? `last staff response <t:${Math.floor(
          alert.lastStaffMessageTime / 1000
        )}:R>`
      : `no staff response since opening <t:${Math.floor(
          alert.threadCreatedTimestamp / 1000
        )}:R>`

    lines.push(`- <#${alert.threadId}> — ${activityDescription}`)
  }

  const omittedCount = alerts.length - displayedAlerts.length
  if (omittedCount > 0) {
    lines.push(
      `- …and ${omittedCount} more (details omitted to avoid flooding this channel).`
    )
  }

  return lines.join('\n')
}

async function sendMissingStaffResponseAlerts(
  alertChannel: TextChannel,
  alerts: Array<MissingStaffResponseAlert>
): Promise<boolean> {
  try {
    await alertChannel.send({
      content: buildMissingStaffResponseAlertContent(alerts),
      allowedMentions: {
        roles: [],
        users: [],
        parse: [],
      },
    })
    return true
  } catch (error) {
    console.error('Failed to send 14-day staff response alerts:', error)
    return false
  }
}

export async function sendInactiveAlert(
  alertChannel: TextChannel,
  thread: ThreadChannel,
  timeSince: string,
  lastStaffMemberId: string | null
): Promise<boolean> {
  try {
    const handlerPing = lastStaffMemberId
      ? `<@${lastStaffMemberId}> `
      : 'Unknown Staff Member '
    await alertChannel.send(
      `${handlerPing} -> :warning: Please check <#${thread.id}> - inactive since ${timeSince}`
    )
    return true
  } catch (error) {
    console.error('Failed to send inactive thread alert:', error)
    return false
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

function collectText(value: unknown, output: Array<string>): void {
  if (typeof value === 'string') {
    output.push(value)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) collectText(item, output)
    return
  }

  if (!value || typeof value !== 'object') return

  const serializable = value as { toJSON?: () => unknown }
  if (typeof serializable.toJSON === 'function') {
    collectText(serializable.toJSON(), output)
    return
  }

  for (const item of Object.values(value as Record<string, unknown>)) {
    collectText(item, output)
  }
}

type MessageTextSource = {
  content?: string
  components?: ReadonlyArray<unknown>
  embeds?: ReadonlyArray<unknown>
}

function getMessageText(message: MessageTextSource): Array<string> {
  const messageText: Array<string> = []
  collectText(message.content, messageText)
  collectText(message.components, messageText)
  collectText(message.embeds, messageText)
  return messageText
}

function addMentionedUserIds(text: string, userIds: Set<string>): void {
  for (const match of text.matchAll(/<@!?(\d+)>/g)) {
    const userId = match[1]
    if (userId) userIds.add(userId)
  }
}

const TICKET_NOTIFICATION_PHRASES = [
  'has created a ticket',
  'has created an auctions ticket',
  'has opened a dispute',
  'has had a dispute opened by',
  'would like to talk to you',
]

function isTicketNotificationText(text: string): boolean {
  const normalizedText = text.toLowerCase()
  return TICKET_NOTIFICATION_PHRASES.some((phrase) =>
    normalizedText.includes(phrase)
  )
}

function getReviewerFieldMentionedUserId(
  embeds: ReadonlyArray<unknown> | undefined
): string | null {
  for (const embed of embeds ?? []) {
    if (!embed || typeof embed !== 'object') continue

    const fields = (embed as { fields?: unknown }).fields
    if (!Array.isArray(fields)) continue

    for (const field of fields) {
      if (!field || typeof field !== 'object') continue

      const { name, value } = field as { name?: unknown; value?: unknown }
      if (
        typeof name !== 'string' ||
        name.replace(/\*/g, '').trim().toLowerCase() !== 'reviewer' ||
        typeof value !== 'string'
      ) {
        continue
      }

      const reviewerId = value.match(/<@!?(\d+)>/)?.[1]
      if (reviewerId) return reviewerId
    }
  }

  return null
}

export function getTicketMetadataMentionedUserIds(
  message: MessageTextSource
): Array<string> {
  const userIds = new Set<string>()

  // Plain content is the legacy ticket notification format.
  if (message.content) addMentionedUserIds(message.content, userIds)

  const structuredText: Array<string> = []
  collectText(message.components, structuredText)
  collectText(message.embeds, structuredText)
  for (const text of structuredText) {
    if (isTicketNotificationText(text)) {
      addMentionedUserIds(text, userIds)
    }
  }

  const reviewerId = getReviewerFieldMentionedUserId(message.embeds)
  if (reviewerId) userIds.add(reviewerId)

  return Array.from(userIds)
}

export function getAssignedReviewerMentionedUserId(
  message: MessageTextSource
): string | null {
  for (const text of getMessageText(message)) {
    if (!isTicketNotificationText(text)) continue

    const assignment = text.match(/<@!?(\d+)>\s+please take a look\b/i)
    if (assignment?.[1]) return assignment[1]
  }

  return getReviewerFieldMentionedUserId(message.embeds)
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

export async function getMostActiveRoutedStaffSpeaker(
  thread: ThreadChannel
): Promise<{
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
      explicitlyAssigned: boolean
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
      if (!messages || messages.size === 0) break

      for (const message of messages.values()) {
        if (message.author.id === thread.client.user.id) {
          const assignedReviewerId = getAssignedReviewerMentionedUserId(message)
          let assignedReviewer: {
            id: string
            roles: { cache: { has: (roleId: string) => boolean } }
          } | null = null
          let lastMentionedStaff: {
            id: string
            roles: { cache: { has: (roleId: string) => boolean } }
          } | null = null

          for (const mentionedUserId of getTicketMetadataMentionedUserIds(
            message
          )) {
            const mentionedMember = await getAlertEligibleMember(
              thread,
              mentionedUserId,
              memberCache
            )

            if (mentionedMember) {
              lastMentionedStaff = mentionedMember
              if (mentionedUserId === assignedReviewerId) {
                assignedReviewer = mentionedMember
              }
            }
          }

          const mentionedStaff = assignedReviewer ?? lastMentionedStaff
          const explicitlyAssigned = assignedReviewer !== null

          if (
            mentionedStaff &&
            (!latestMentionedStaff ||
              (explicitlyAssigned &&
                !latestMentionedStaff.explicitlyAssigned) ||
              (explicitlyAssigned === latestMentionedStaff.explicitlyAssigned &&
                message.createdTimestamp > latestMentionedStaff.mentionedAt))
          ) {
            latestMentionedStaff = {
              explicitlyAssigned,
              memberId: mentionedStaff.id,
              route: getMemberAlertRoute(mentionedStaff),
              isTrialReviewer: mentionedStaff.roles.cache.has(
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
