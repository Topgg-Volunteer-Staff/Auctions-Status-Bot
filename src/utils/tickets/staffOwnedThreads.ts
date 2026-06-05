import {
  ChannelType,
  TextChannel,
  ThreadChannel,
  type Guild,
} from 'discord.js'
import { channelIds, resolvedFlag } from '../../globals'
import { resolveThreadOwnerUserId } from './staffTicketReminders'

export type TicketCategory = 'Mod' | 'Reviewer' | 'Auctions'

export type TicketThreadMatch = {
  category: TicketCategory
  thread: ThreadChannel
}

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