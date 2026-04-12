import {
  Client,
  ChatInputCommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  User,
} from 'discord.js'

import { errorEmbed } from '../utils/embeds'
import { roleIds } from '../globals'
import {
  AuditDateRange,
  getResolvedLeaderboard,
  getResolvedTicketsByUser,
} from '../utils/db/resolvedTickets'

const auditColor = 0xff3366

const datePattern = /^(\d{2})-(\d{2})-(\d{4})$/

type ParsedDate = {
  year: number
  month: number
  day: number
}

type DateRangeWithLabel = AuditDateRange & {
  label: string
}

const parseDateInput = (input: string): ParsedDate => {
  const trimmed = input.trim()
  const match = datePattern.exec(trimmed)

  if (!match) {
    throw new Error(`Invalid date \`${input}\`. Use dd-mm-yyyy.`)
  }

  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])

  const parsed = new Date(Date.UTC(year, month - 1, day))

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date \`${input}\`.`)
  }

  return { year, month, day }
}

const createDateRange = (
  startInput: string,
  endInput: string
): DateRangeWithLabel => {
  const startParsed = parseDateInput(startInput)
  const endParsed = parseDateInput(endInput)

  const start = new Date(
    Date.UTC(startParsed.year, startParsed.month - 1, startParsed.day, 0, 0, 0)
  )
  const end = new Date(
    Date.UTC(
      endParsed.year,
      endParsed.month - 1,
      endParsed.day,
      23,
      59,
      59,
      999
    )
  )

  if (start.getTime() > end.getTime()) {
    throw new Error('The start date must be on or before the end date.')
  }

  return {
    start,
    end,
    label: `${startInput} -> ${endInput}`,
  }
}

const createSwappedDateRange = (
  startInput: string,
  endInput: string
): DateRangeWithLabel => {
  const startMatch = datePattern.exec(startInput.trim())
  const endMatch = datePattern.exec(endInput.trim())

  if (!startMatch || !endMatch) {
    throw new Error('Invalid date. Use dd-mm-yyyy or mm-dd-yyyy.')
  }

  const swappedStart = `${startMatch[2]}-${startMatch[1]}-${startMatch[3]}`
  const swappedEnd = `${endMatch[2]}-${endMatch[1]}-${endMatch[3]}`

  const range = createDateRange(swappedStart, swappedEnd)
  return {
    ...range,
    label: `${startInput} -> ${endInput}`,
  }
}

const isAmbiguousDateInput = (input: string): boolean => {
  const match = datePattern.exec(input.trim())
  if (!match) return false

  const first = Number(match[1])
  const second = Number(match[2])
  return first >= 1 && first <= 12 && second >= 1 && second <= 12
}

const isAmbiguousDateRange = (startInput: string, endInput: string): boolean =>
  isAmbiguousDateInput(startInput) || isAmbiguousDateInput(endInput)

const formatRangeLabel = (range: DateRangeWithLabel): string => range.label

const isNoResultsEmbedSet = (embeds: Array<EmbedBuilder>): boolean => {
  if (embeds.length !== 1) return false

  const [firstEmbed] = embeds
  const description = firstEmbed?.data.description
  return description?.includes('No resolved tickets were recorded') ?? false
}

const toUnixSeconds = (date: Date): number => Math.floor(date.getTime() / 1000)

const buildAuditEmbed = (): EmbedBuilder =>
  new EmbedBuilder().setColor(auditColor).setTitle('Resolved Tickets Audit').setTimestamp()

const formatThreadCountLabel = (count: number): string =>
  `${count} resolved thread${count === 1 ? '' : 's'}`

const formatUserMention = (userId: string): string => `<@${userId}>`

const resolveDisplayName = async (
  interaction: ChatInputCommandInteraction,
  userId: string,
  fallback: string
): Promise<string> => {
  if (!interaction.inCachedGuild()) return fallback

  const member = await interaction.guild.members.fetch(userId).catch(() => null)
  return member?.displayName ?? fallback
}

const chunkThreadLines = (lines: Array<string>): Array<string> => {
  const chunks: Array<string> = []
  let current = ''

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line
    if (next.length > 3500) {
      if (current) chunks.push(current)
      current = line
      continue
    }
    current = next
  }

  if (current) chunks.push(current)
  return chunks
}

const buildUserEmbeds = async (
  interaction: ChatInputCommandInteraction,
  targetUser: User,
  range: DateRangeWithLabel
): Promise<Array<EmbedBuilder>> => {
  const records = await getResolvedTicketsByUser(targetUser.id, range)
  const displayName = await resolveDisplayName(
    interaction,
    targetUser.id,
    targetUser.username
  )

  if (records.length === 0) {
    return [
      buildAuditEmbed()
        .setDescription(`No resolved tickets were recorded for **${displayName}** in this range.`)
        .addFields(
          {
            name: 'Staff Member',
            value: displayName,
            inline: true,
          },
          {
            name: 'Date Range',
            value: formatRangeLabel(range),
            inline: true,
          }
        )
        .setFooter({
          text: 'No resolved threads found',
        }),
    ]
  }

  const threadLines = records.map((record) => {
    const resolvedAt = `<t:${toUnixSeconds(record.resolvedAt)}:d>`
    return `• <#${record.threadId}> (${record.threadName}) - ${resolvedAt}`
  })

  const chunks = chunkThreadLines(threadLines)

  return chunks.map((chunk, index) => {
    const embed = buildAuditEmbed()
      .setDescription(
        [
          `**Date Range**`,
          formatRangeLabel(range),
          '',
          `**Staff Member**`,
          displayName,
          '',
          `**Resolved Threads**`,
          chunk,
        ].join('\n')
      )
      .setFooter({
        text: `Showing ${formatThreadCountLabel(records.length)}`,
      })

    if (chunks.length > 1) {
      embed.setFooter({
        text: `Showing ${formatThreadCountLabel(records.length)} • Page ${index + 1}/${chunks.length}`,
      })
    }

    return embed
  })
}

export const command = new SlashCommandBuilder()
  .setName('audit-resolved')
  .setDescription('Audit resolved tickets over a required date range')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName('start_date')
      .setDescription('Start date in dd-mm-yyyy')
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(10)
  )
  .addStringOption((option) =>
    option
      .setName('end_date')
      .setDescription('End date in dd-mm-yyyy')
      .setRequired(true)
      .setMinLength(10)
      .setMaxLength(10)
  )
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('Optional user to expand into per-thread results')
      .setRequired(false)
  )

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

  if (!interaction.member.roles.cache.has(roleIds.moderator)) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          'Missing permissions',
          'Only moderators can use this command.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    const startInput = interaction.options.getString('start_date', true)
    const endInput = interaction.options.getString('end_date', true)
    const range = createDateRange(startInput, endInput)
    const hasAmbiguousInput = isAmbiguousDateRange(startInput, endInput)

    const targetUser = interaction.options.getUser('user')

    if (!targetUser) {
      let resolvedRange = range
      let leaderboard = await getResolvedLeaderboard(range)

      if (leaderboard.length === 0 && hasAmbiguousInput) {
        const fallbackRange = createSwappedDateRange(startInput, endInput)
        const fallbackLeaderboard = await getResolvedLeaderboard(fallbackRange)

        if (fallbackLeaderboard.length > 0) {
          resolvedRange = fallbackRange
          leaderboard = fallbackLeaderboard
        }
      }

      if (leaderboard.length === 0) {
        await interaction.editReply({
          embeds: [
            buildAuditEmbed()
              .setDescription('No resolved tickets were recorded in this range.')
              .addFields({
                name: 'Date Range',
                value: formatRangeLabel(range),
              })
              .setFooter({
                text: 'No resolved threads found',
              }),
          ],
        })
        return
      }

      const lines = leaderboard.map(
        (entry, index) =>
          `${index + 1}. ${formatUserMention(entry.userId)} - ${entry.count}`
      )

      const totalResolved = leaderboard.reduce(
        (sum, entry) => sum + entry.count,
        0
      )

      await interaction.editReply({
        embeds: [
          buildAuditEmbed()
            .setDescription(
              [
                '**Date Range**',
                formatRangeLabel(resolvedRange),
                '',
                '**Leaderboard**',
                lines.join('\n'),
              ].join('\n')
            )
            .setFooter({
              text: `${totalResolved} resolved thread(s) across ${leaderboard.length} staff member(s)`,
            }),
        ],
      })
      return
    }

    let embeds = await buildUserEmbeds(interaction, targetUser, range)

    if (hasAmbiguousInput && isNoResultsEmbedSet(embeds)) {
      const fallbackRange = createSwappedDateRange(startInput, endInput)
      const fallbackEmbeds = await buildUserEmbeds(
        interaction,
        targetUser,
        fallbackRange
      )

      const hasFallbackResults = !isNoResultsEmbedSet(fallbackEmbeds)

      if (hasFallbackResults) {
        embeds = fallbackEmbeds
      }
    }

    await interaction.editReply({ embeds })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to audit resolved tickets.'

    await interaction.editReply({
      embeds: [errorEmbed('Audit failed', message)],
    })
  }
}