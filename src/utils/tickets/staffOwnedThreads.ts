import {
  ChannelType,
  Message,
  TextChannel,
  ThreadChannel,
  type Guild,
} from 'discord.js'
import { channelIds, resolvedFlag, roleIds } from '../../globals'
import { resolveThreadOwnerUserId } from './staffTicketReminders'

export type TicketCategory = 'Mod' | 'Reviewer' | 'Auctions'
export type TicketAttentionState =
  | 'awaiting-response'
  | 'waiting-on-user'
  | 'unknown'

export type TicketThreadMatch = {
  category: TicketCategory
  thread: ThreadChannel
}

const THREAD_ATTENTION_PAGE_SIZE = 25
const THREAD_ATTENTION_SCAN_PAGE_LIMIT = 3
const ARCHIVED_THREAD_PAGE_SIZE = 100
const STAFF_TICKET_ROLE_IDS = [
  roleIds.moderator,
  roleIds.reviewer,
  roleIds.trialReviewer,
  roleIds.supportTeam,
]

async function fetchTicketThreadsFromParent(
  channel: TextChannel,
  includeArchived: boolean
): Promise<Array<ThreadChannel>> {
  const threadMap = new Map<string, ThreadChannel>()
  const active = await channel.threads.fetchActive().catch(() => null)

  if (active) {
    for (const thread of active.threads.values()) {
      threadMap.set(thread.id, thread)
    }
  }

  if (!includeArchived) return [...threadMap.values()]

  let before: string | undefined
  let hasMoreArchivedThreads = true

  while (hasMoreArchivedThreads) {
    const archived = await channel.threads
      .fetchArchived({
        type: 'private',
        fetchAll: true,
        limit: ARCHIVED_THREAD_PAGE_SIZE,
        ...(before ? { before } : {}),
      })
      .catch(() => null)

    if (!archived || archived.threads.size === 0) break

    const pageThreads = [...archived.threads.values()]
    let addedCount = 0

    for (const thread of pageThreads) {
      if (!threadMap.has(thread.id)) addedCount += 1
      threadMap.set(thread.id, thread)
    }

    before = pageThreads[pageThreads.length - 1]?.id
    hasMoreArchivedThreads =
      pageThreads.length === ARCHIVED_THREAD_PAGE_SIZE &&
      addedCount > 0 &&
      typeof before === 'string'
  }

  return [...threadMap.values()]
}

async function fetchTicketParentChannels(
  guild: Guild
): Promise<Array<TextChannel>> {
  const parentChannels = await Promise.all([
    guild.channels.fetch(channelIds.modTickets),
    guild.channels.fetch(channelIds.auctionsTickets),
  ])

  return parentChannels.filter(
    (channel): channel is TextChannel => channel instanceof TextChannel
  )
}

function normalizeName(name: string): string {
  return name
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[–—−]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .trim()
    .toLowerCase()
}

function isOpenTicketThread(thread: ThreadChannel): boolean {
  return (
    thread.type === ChannelType.PrivateThread &&
    !normalizeName(thread.name).startsWith(normalizeName(resolvedFlag))
  )
}

async function isStaffMember(
  guild: Guild,
  userId: string,
  staffMembershipCache: Map<string, boolean>
): Promise<boolean> {
  const cached = staffMembershipCache.get(userId)
  if (typeof cached === 'boolean') {
    return cached
  }

  const member = await guild.members.fetch(userId).catch(() => null)
  const isStaff =
    !!member &&
    STAFF_TICKET_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId))

  staffMembershipCache.set(userId, isStaff)
  return isStaff
}

async function getLatestRelevantMessage(
  thread: ThreadChannel
): Promise<Message | null> {
  let before: string | undefined

  for (let page = 0; page < THREAD_ATTENTION_SCAN_PAGE_LIMIT; page++) {
    const fetchOptions: { limit: number; before?: string } = {
      limit: THREAD_ATTENTION_PAGE_SIZE,
    }
    if (before) fetchOptions.before = before

    const messages = await thread.messages.fetch(fetchOptions).catch(() => null)
    if (!messages || messages.size === 0) {
      break
    }

    const orderedMessages = [...messages.values()].sort(
      (left, right) => right.createdTimestamp - left.createdTimestamp
    )

    for (const message of orderedMessages) {
      if (message.author.bot || message.webhookId || message.system) {
        continue
      }

      return message
    }

    before = messages.last()?.id
    if (!before || messages.size < THREAD_ATTENTION_PAGE_SIZE) {
      break
    }
  }

  return null
}

export function getTicketCategory(thread: ThreadChannel): TicketCategory {
  if (thread.parentId === channelIds.auctionsTickets) {
    return 'Auctions'
  }

  const normalizedName = normalizeName(thread.name)

  return normalizedName.startsWith('dispute-') ||
    normalizedName.startsWith('reviewer-')
    ? 'Reviewer'
    : 'Mod'
}

export async function getTicketAttentionState(
  thread: ThreadChannel
): Promise<TicketAttentionState> {
  const latestMessage = await getLatestRelevantMessage(thread)
  if (!latestMessage) {
    return 'unknown'
  }

  const staffMembershipCache = new Map<string, boolean>()
  const latestAuthorIsStaff = await isStaffMember(
    thread.guild,
    latestMessage.author.id,
    staffMembershipCache
  )

  return latestAuthorIsStaff ? 'waiting-on-user' : 'awaiting-response'
}

export async function getOpenUnclaimedTickets(
  guild: Guild
): Promise<Array<TicketThreadMatch>> {
  const matches: Array<TicketThreadMatch> = []
  const openTickets = await getAllOpenTicketThreads(guild)

  for (const ticket of openTickets) {
    const ownerId = await resolveThreadOwnerUserId(ticket.thread).catch(
      () => null
    )
    if (ownerId === null) {
      matches.push(ticket)
    }
  }

  return matches
}

export async function getAllOpenTicketThreads(
  guild: Guild,
  options: { includeArchived?: boolean } = {}
): Promise<Array<TicketThreadMatch>> {
  const matches: Array<TicketThreadMatch> = []
  const ticketParents = await fetchTicketParentChannels(guild)
  const includeArchived = options.includeArchived ?? true

  for (const parent of ticketParents) {
    const threads = await fetchTicketThreadsFromParent(parent, includeArchived)

    for (const thread of threads) {
      if (!isOpenTicketThread(thread)) {
        continue
      }

      matches.push({
        category: getTicketCategory(thread),
        thread,
      })
    }
  }

  return matches
}

export async function getOpenThreadsForStaffMember(
  memberId: string,
  guild: Guild
): Promise<Array<ThreadChannel>> {
  const matchingThreads: Array<ThreadChannel> = []
  const openTickets = await getAllOpenTicketThreads(guild)

  for (const ticket of openTickets) {
    const ownerId = await resolveThreadOwnerUserId(ticket.thread).catch(
      () => null
    )
    if (ownerId === memberId) {
      matchingThreads.push(ticket.thread)
    }
  }

  return matchingThreads
}
