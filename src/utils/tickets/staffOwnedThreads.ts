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
const STAFF_TICKET_ROLE_IDS = [
  roleIds.moderator,
  roleIds.reviewer,
  roleIds.trialReviewer,
  roleIds.supportTeam,
]

async function fetchTicketThreadsFromParent(
  channel: TextChannel
): Promise<Array<ThreadChannel>> {
  const active = await channel.threads.fetchActive().catch(() => null)
  const archived = await channel.threads.fetchArchived({ limit: 100 }).catch(() => null)

  const threads: Array<ThreadChannel> = []

  if (active) {
    for (const thread of active.threads.values()) {
      threads.push(thread)
    }
  }

  if (archived) {
    for (const thread of archived.threads.values()) {
      threads.push(thread)
    }
  }

  return threads
}

async function fetchTicketParentChannels(guild: Guild): Promise<Array<TextChannel>> {
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
    !thread.name.startsWith(resolvedFlag)
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

async function getLatestRelevantMessage(thread: ThreadChannel): Promise<Message | null> {
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
  const ticketParents = await fetchTicketParentChannels(guild)

  for (const parent of ticketParents) {
    const threads = await fetchTicketThreadsFromParent(parent)

    for (const thread of threads) {
      if (!isOpenTicketThread(thread)) {
        continue
      }

      const ownerId = await resolveThreadOwnerUserId(thread).catch(() => null)
      if (ownerId !== null) {
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
  const ticketParents = await fetchTicketParentChannels(guild)

  for (const parent of ticketParents) {
    const threads = await fetchTicketThreadsFromParent(parent)

    for (const thread of threads) {
      if (!isOpenTicketThread(thread)) {
        continue
      }

      const ownerId = await resolveThreadOwnerUserId(thread).catch(() => null)
      if (ownerId === memberId) {
        matchingThreads.push(thread)
      }
    }
  }

  return matchingThreads
}