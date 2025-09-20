import {
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
  ThreadChannel,
  MessageFlags,
  TextChannel,
  Collection,
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
  .addStringOption((opt) =>
    opt
      .setName('type')
      .setDescription('Type of tickets to check (mod, reviewer or auctions)')
      .setRequired(true)
      .addChoices(
        { name: 'mod', value: 'mod' },
        { name: 'reviewer', value: 'reviewer' },
        { name: 'auctions', value: 'auctions' }
      )
  )

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  const type = interaction.options.getString('type', true) as
    | 'mod'
    | 'reviewer'
    | 'auctions'

  const parentId =
    type === 'auctions' ? channelIds.auctionsTickets : channelIds.modTickets

  if (!interaction.guild) {
    await interaction.reply({
      embeds: [errorEmbed('Guild not available')],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  try {
    const parent = await interaction.guild.channels.fetch(parentId)

    if (!parent) {
      await interaction.reply({
        embeds: [errorEmbed('Parent channel not found')],
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Ensure parent is a TextChannel so we can access threads
    if (!(parent instanceof TextChannel)) {
      await interaction.reply({
        embeds: [errorEmbed('Parent channel is not a text channel')],
        flags: MessageFlags.Ephemeral,
      })
      return
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
        if (maybe && typeof (maybe as { forEach?: unknown }).forEach === 'function')
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

    let unresolved: Array<ThreadChannel> = []

    const resolvedNorm = normalizeName(resolvedFlag)

    if (type === 'reviewer') {
      // Reviewer tickets use the `dispute-` prefix (allow spaces around hyphen)
      unresolved = threads.filter((t) => {
        const n = normalizeName(t.name)
        return n.startsWith('dispute-') && !n.startsWith(resolvedNorm)
      })
    } else if (type === 'mod') {
      // Mod tickets are any non-reviewer tickets (exclude `dispute-`)
      unresolved = threads.filter((t) => {
        const n = normalizeName(t.name)
        return !n.startsWith('dispute-') && !n.startsWith(resolvedNorm)
      })
    } else {
      // auctions
      unresolved = threads.filter((t) => {
        const n = normalizeName(t.name)
        return !n.startsWith(resolvedNorm)
      })
    }

    if (unresolved.length === 0) {
      await interaction.reply({
        embeds: [
          successEmbed(
            'No unresolved tickets',
            `No unresolved ${type} tickets found.`
          ),
        ],
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Build a message with a limited number of links (Discord limits 25 embeds/lines practically)
    const max = 25
    const listed = unresolved.slice(0, max)

    const lines = listed.map((t) => `- <#${t.id}> (${t.name})`).join('\n')

    const more =
      unresolved.length > max ? `\n...and ${unresolved.length - max} more` : ''

    const titleType = type === 'reviewer' ? 'reviewer' : type
    await interaction.reply({
      embeds: [
        successEmbed(
          `${unresolved.length} unresolved ${titleType} tickets`,
          lines + more
        ),
      ],
      flags: MessageFlags.Ephemeral,
    })
  } catch (err) {
    console.error('Failed to list unresolved threads', err)
    await interaction.reply({
      embeds: [errorEmbed('Failed to list unresolved threads')],
      flags: MessageFlags.Ephemeral,
    })
  }
}
