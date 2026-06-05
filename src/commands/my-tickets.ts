import {
  ChatInputCommandInteraction,
  Client,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  ThreadChannel,
} from 'discord.js'
import { channelIds } from '../globals'
import { errorEmbed, successEmbed } from '../utils/embeds'
import { isStaffReminderEligibleInteraction } from '../utils/tickets/staffTicketReminders'
import { getOpenThreadsForStaffMember } from '../utils/tickets/staffOwnedThreads'

type TicketCategory = 'Mod' | 'Reviewer' | 'Auctions'

const discordEpochMs = 1420070400000

export const command = new SlashCommandBuilder()
  .setName('my-tickets')
  .setDescription('Show the tickets currently assigned to you')
  .setContexts(InteractionContextType.Guild)

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      embeds: [
        errorEmbed('Server only', 'This command can only be used in a server.'),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (!(await isStaffReminderEligibleInteraction(interaction))) {
    await interaction.reply({
      embeds: [errorEmbed('Missing permissions', 'Only staff members can use this command.')],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const openThreads = await getOpenThreadsForStaffMember(
    interaction.user.id,
    interaction.guild
  )

  openThreads.sort(
    (left, right) =>
      (threadOpenedUnixSeconds(left) ?? 0) - (threadOpenedUnixSeconds(right) ?? 0)
  )

  if (openThreads.length === 0) {
    await interaction.editReply({
      embeds: [
        successEmbed(
          'No tickets assigned',
          'I could not find any open mod, reviewer, or auctions tickets currently assigned to you.'
        ),
      ],
    })
    return
  }

  const lines = openThreads.map(
    (thread) =>
      `- [${getTicketCategory(thread)}] <#${thread.id}> (${thread.name}) - ${formatOpened(thread)}`
  )

  const pages = chunkLines(lines, 3800)

  await interaction.editReply({
    embeds: pages.map((page, index) =>
      successEmbed(
        index === 0 ? 'Your tickets' : 'More tickets',
        `${
          index === 0
            ? `Found ${openThreads.length} open ticket${openThreads.length === 1 ? '' : 's'} currently assigned to you by staff message ownership.\n\n`
            : ''
        }${page}`
      ).setFooter({
        text: `Page ${index + 1} of ${pages.length}`,
      })
    ),
  })
}

function getTicketCategory(thread: ThreadChannel): TicketCategory {
  if (thread.parentId === channelIds.auctionsTickets) {
    return 'Auctions'
  }

  return normalizeName(thread.name).startsWith('dispute-') ? 'Reviewer' : 'Mod'
}

function normalizeName(name: string): string {
  return name
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[–—−]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .trim()
    .toLowerCase()
}

function chunkLines(lines: Array<string>, maxLength: number): Array<string> {
  const pages: Array<string> = []
  let current = ''

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line
    if (next.length > maxLength && current) {
      pages.push(current)
      current = line
      continue
    }

    current = next
  }

  if (current) {
    pages.push(current)
  }

  return pages
}

function formatOpened(thread: ThreadChannel): string {
  const openedAt = threadOpenedUnixSeconds(thread)
  if (!openedAt) {
    return 'opened at an unknown time'
  }

  return `opened <t:${openedAt}:f> (<t:${openedAt}:R>)`
}

function threadOpenedUnixSeconds(thread: ThreadChannel): number | null {
  const createdMs = thread.createdTimestamp
  if (
    typeof createdMs === 'number' &&
    Number.isFinite(createdMs) &&
    createdMs > 0
  ) {
    return Math.floor(createdMs / 1000)
  }

  return snowflakeToUnixSeconds(thread.id)
}

function snowflakeToUnixSeconds(id: string): number | null {
  try {
    const ms = Number((BigInt(id) >> 22n) + BigInt(discordEpochMs))
    if (!Number.isFinite(ms) || ms <= 0) {
      return null
    }

    return Math.floor(ms / 1000)
  } catch {
    return null
  }
}