import {
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
  ThreadChannel,
  MessageFlags,
  TextChannel,
  Collection,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'

import { channelIds, resolvedFlag } from '../globals'
import { errorEmbed, successEmbed } from '../utils/embeds'

// Normalize thread names to avoid invisible characters and different dash types
const normalizeName = (s: string): string =>
  s
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // remove zero-width spaces
    .replace(/[–—−]/g, '-') // normalize various dashes to hyphen
    .replace(/\s*-\s*/g, '-') // collapse spaces around hyphen
    .trim()
    .toLowerCase()

export const command = new SlashCommandBuilder()
  .setName('unresolved')
  .setDescription('List unresolved tickets for mod, reviewer, or auctions')
  .setContexts(InteractionContextType.Guild)

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  if (!interaction.guild) {
    await interaction.reply({
      embeds: [errorEmbed('Guild not available')],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  // Get all unresolved tickets by default
  const result = await getUnresolvedTickets(interaction.guild, 'all')

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('unresolved_all')
      .setLabel('All')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('unresolved_mod')
      .setLabel('Mod')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('unresolved_reviewer')
      .setLabel('Reviewer')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('unresolved_auctions')
      .setLabel('Auctions')
      .setStyle(ButtonStyle.Secondary)
  )

  if (result.title === 'Error') {
    await interaction.editReply({
      embeds: [errorEmbed('Error', result.content)],
      components: [row],
    })
    return
  }

  await interaction.editReply({
    embeds: [successEmbed(result.title, result.content)],
    components: [row],
  })
}

// Helper function to get unresolved tickets for a specific type
export const getUnresolvedTickets = async (
  guild: any,
  type: 'mod' | 'reviewer' | 'auctions' | 'all'
): Promise<{ content: string; title: string }> => {
  try {
    // Helper function to fetch threads from a channel
    const fetchThreadsFromChannel = async (
      channelId: string
    ): Promise<ThreadChannel[]> => {
      const parent = await guild.channels.fetch(channelId)
      if (!parent || !(parent instanceof TextChannel)) {
        return []
      }

      const threadManager = parent.threads

      // Minimal typed interface for thread manager fetch methods to avoid `any`.
      type ThreadFetchMethods = {
        fetchActive?: () => Promise<unknown>
        fetchArchived?: (opts?: unknown) => Promise<unknown>
        fetch?: (opts?: unknown) => Promise<unknown>
      }

      const threadFetcher = threadManager as unknown as ThreadFetchMethods

      // Fetch active threads (if supported)
      const extractThreads = (
        res: unknown
      ): Collection<string, ThreadChannel> => {
        if (!res || typeof res !== 'object') return new Collection()
        if ('threads' in (res as Record<string, unknown>)) {
          const maybe = (res as Record<string, unknown>).threads
          if (
            maybe &&
            typeof (maybe as { forEach?: unknown }).forEach === 'function'
          )
            return maybe as Collection<string, ThreadChannel>
        }
        return new Collection()
      }

      let activeThreads: Collection<string, ThreadChannel> = new Collection()
      if (typeof threadFetcher.fetchActive === 'function') {
        const res = await threadFetcher.fetchActive()
        activeThreads = extractThreads(res)
      }

      // Fetch archived threads (try fetchArchived then fetch with archived flag)
      let archivedThreads: Collection<string, ThreadChannel> = new Collection()
      if (typeof threadFetcher.fetchArchived === 'function') {
        const res = await threadFetcher.fetchArchived({ limit: 100 })
        archivedThreads = extractThreads(res)
      } else if (typeof threadFetcher.fetch === 'function') {
        const res = await threadFetcher.fetch({ archived: true, limit: 100 })
        archivedThreads = extractThreads(res)
      }

      const threads: Array<ThreadChannel> = []
      for (const t of activeThreads.values()) threads.push(t)
      for (const t of archivedThreads.values()) threads.push(t)
      return threads
    }

    let modThreads: ThreadChannel[] = []
    let auctionsThreads: ThreadChannel[] = []

    if (type === 'all') {
      // Fetch from both channels
      modThreads = await fetchThreadsFromChannel(channelIds.modTickets)
      auctionsThreads = await fetchThreadsFromChannel(
        channelIds.auctionsTickets
      )
    } else if (type === 'auctions') {
      auctionsThreads = await fetchThreadsFromChannel(
        channelIds.auctionsTickets
      )
    } else {
      modThreads = await fetchThreadsFromChannel(channelIds.modTickets)
    }

    const resolvedNorm = normalizeName(resolvedFlag)

    if (type === 'all') {
      // Handle "all" case - categorize all unresolved tickets
      const modTickets = modThreads.filter((t) => {
        const n = normalizeName(t.name)
        return !n.startsWith('dispute-') && !n.startsWith(resolvedNorm)
      })

      const reviewerTickets = modThreads.filter((t) => {
        const n = normalizeName(t.name)
        return n.startsWith('dispute-') && !n.startsWith(resolvedNorm)
      })

      const auctionsTickets = auctionsThreads.filter((t) => {
        const n = normalizeName(t.name)
        return !n.startsWith(resolvedNorm)
      })

      const totalUnresolved =
        modTickets.length + reviewerTickets.length + auctionsTickets.length

      if (totalUnresolved === 0) {
        return {
          content: 'No unresolved tickets found across all categories.',
          title: 'No unresolved tickets',
        }
      }

      // Build categorized response
      const maxPerCategory = 8
      const buildCategoryList = (
        tickets: ThreadChannel[],
        categoryName: string
      ) => {
        const listed = tickets.slice(0, maxPerCategory)
        const lines = listed.map((t) => `- <#${t.id}> (${t.name})`).join('\n')
        const more =
          tickets.length > maxPerCategory
            ? `\n...and ${tickets.length - maxPerCategory} more`
            : ''
        return `**${categoryName} (${tickets.length}):**\n${lines}${more}`
      }

      const modSection =
        modTickets.length > 0
          ? buildCategoryList(modTickets, 'Mod Tickets')
          : ''
      const reviewerSection =
        reviewerTickets.length > 0
          ? buildCategoryList(reviewerTickets, 'Reviewer Tickets')
          : ''
      const auctionsSection =
        auctionsTickets.length > 0
          ? buildCategoryList(auctionsTickets, 'Auctions Tickets')
          : ''

      const sections = [modSection, reviewerSection, auctionsSection].filter(
        Boolean
      )
      const content = sections.join('\n\n')

      return {
        content,
        title: `${totalUnresolved} total unresolved tickets`,
      }
    } else {
      // Handle individual types (existing logic)
      let unresolved: Array<ThreadChannel> = []

      if (type === 'reviewer') {
        // Reviewer tickets use the `dispute-` prefix (allow spaces around hyphen)
        unresolved = modThreads.filter((t) => {
          const n = normalizeName(t.name)
          return n.startsWith('dispute-') && !n.startsWith(resolvedNorm)
        })
      } else if (type === 'mod') {
        // Mod tickets are any non-reviewer tickets (exclude `dispute-`)
        unresolved = modThreads.filter((t) => {
          const n = normalizeName(t.name)
          return !n.startsWith('dispute-') && !n.startsWith(resolvedNorm)
        })
      } else {
        // auctions
        unresolved = auctionsThreads.filter((t) => {
          const n = normalizeName(t.name)
          return !n.startsWith(resolvedNorm)
        })
      }

      if (unresolved.length === 0) {
        return {
          content: `No unresolved ${type} tickets found.`,
          title: 'No unresolved tickets',
        }
      }

      // Build a message with a limited number of links (Discord limits 25 embeds/lines practically)
      const max = 25
      const listed = unresolved.slice(0, max)

      const lines = listed.map((t) => `- <#${t.id}> (${t.name})`).join('\n')

      const more =
        unresolved.length > max
          ? `\n...and ${unresolved.length - max} more`
          : ''

      const titleType = type === 'reviewer' ? 'reviewer' : type
      return {
        content: lines + more,
        title: `${unresolved.length} unresolved ${titleType} tickets`,
      }
    }
  } catch (err) {
    console.error('Failed to list unresolved threads', err)
    return {
      content: 'Failed to list unresolved threads',
      title: 'Error',
    }
  }
}
