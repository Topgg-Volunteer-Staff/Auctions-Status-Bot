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
const RECENT_ARCHIVED_TICKET_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000
const OWNER_LOOKUP_BATCH_SIZE = 5
const STAFF_TICKET_ROLE_IDS = [
  roleIds.moderator,
  roleIds.reviewer,
  roleIds.trialReviewer,
  roleIds.supportTeam,
]

async function fetchArchivedTicketThreadsFromParent(
  channel: TextChannel,
  archivedAfter: Date
): Promise<Array<ThreadChannel>> {
  const threadMap = new Map<string, ThreadChannel>()
  let before: Date | undefined
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

    for (const thread of pageThreads) {
      const createdTimestamp = thread.createdTimestamp
      if (
        typeof createdTimestamp === 'number' &&
        createdTimestamp >= archivedAfter.getTime()
      ) {
        threadMap.set(thread.id, thread)
      }
    }

    const oldestArchivedAt = pageThreads[pageThreads.length - 1]?.archivedAt
    before = oldestArchivedAt ?? undefined
    hasMoreArchivedThreads =
      archived.hasMore &&
      before instanceof Date &&
      before.getTime() >= archivedAfter.getTime()
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
  const normalizedName = normalizeName(thread.name)

  return (
    thread.type === ChannelType.PrivateThread &&
    !normalizedName.startsWith(normalizeName(resolvedFlag)) &&
    !normalizedName.startsWith('[closed]')
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
  const openTickets = await getAllOpenTicketThreads(guild, {
    archivedLookbackMs: RECENT_ARCHIVED_TICKET_LOOKBACK_MS,
  })

  for (
    let index = 0;
    index < openTickets.length;
    index += OWNER_LOOKUP_BATCH_SIZE
  ) {
    const batch = openTickets.slice(index, index + OWNER_LOOKUP_BATCH_SIZE)
    const ownerIds = await Promise.all(
      batch.map((ticket) =>
        resolveThreadOwnerUserId(ticket.thread).catch(() => null)
      )
    )

    for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
      const ticket = batch[batchIndex]
      if (ticket && ownerIds[batchIndex] === null) {
        matches.push(ticket)
      }
    }
  }

  return matches
}

export async function getAllOpenTicketThreads(
  guild: Guild,
  options: { includeArchived?: boolean; archivedLookbackMs?: number } = {}
): Promise<Array<TicketThreadMatch>> {
  const matches: Array<TicketThreadMatch> = []
  const ticketParents = await fetchTicketParentChannels(guild)
  const includeArchived = options.includeArchived ?? true
  const parentIds = new Set(ticketParents.map((parent) => parent.id))
  const archivedAfter = new Date(
    options.archivedLookbackMs === undefined
      ? 0
      : Date.now() - options.archivedLookbackMs
  )
  const [active, ...archivedByParent] = await Promise.all([
    guild.channels.fetchActiveThreads().catch(() => null),
    ...ticketParents.map((parent) =>
      includeArchived
        ? fetchArchivedTicketThreadsFromParent(parent, archivedAfter)
        : Promise.resolve([])
    ),
  ])
  const threads = new Map<string, ThreadChannel>()

  if (active) {
    for (const thread of active.threads.values()) {
      if (thread.parentId && parentIds.has(thread.parentId)) {
        threads.set(thread.id, thread)
      }
    }
  }

  for (const archivedThreads of archivedByParent) {
    for (const thread of archivedThreads) {
      threads.set(thread.id, thread)
    }
  }

  for (const thread of threads.values()) {
    if (!isOpenTicketThread(thread)) {
      continue
    }

    matches.push({
      category: getTicketCategory(thread),
      thread,
    })
  }

  return matches
}

export async function getOpenThreadsForStaffMember(
  memberId: string,
  guild: Guild
): Promise<Array<ThreadChannel>> {
  const matchingThreads: Array<ThreadChannel> = []
  const openTickets = await getAllOpenTicketThreads(guild, {
    archivedLookbackMs: RECENT_ARCHIVED_TICKET_LOOKBACK_MS,
  })

  for (
    let index = 0;
    index < openTickets.length;
    index += OWNER_LOOKUP_BATCH_SIZE
  ) {
    const batch = openTickets.slice(index, index + OWNER_LOOKUP_BATCH_SIZE)
    const ownerIds = await Promise.all(
      batch.map((ticket) =>
        resolveThreadOwnerUserId(ticket.thread).catch(() => null)
      )
    )

    for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
      const ticket = batch[batchIndex]
      if (ticket && ownerIds[batchIndex] === memberId) {
        matchingThreads.push(ticket.thread)
      }
    }
  }

  return matchingThreads
}
