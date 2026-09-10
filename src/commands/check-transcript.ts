import {
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
  PermissionsBitField,
} from 'discord.js'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
} from '../utils/componentsV2'
import {
  getTranscript,
  getUserTranscripts,
  StoredTranscript,
} from '../utils/db/transcripts'
import { createTranscriptPanel } from '../utils/tickets/sendTranscript'
import { getTranscriptUrl } from '../utils/webServer'
import { roleIds } from '../globals'
import { sendErrorLog } from '../utils/errorLogging'

const MAX_SELECT_OPTIONS = 25

export const command = new SlashCommandBuilder()
  .setName('check-transcript')
  .setDescription('View transcripts for a specific user')
  .setContexts(InteractionContextType.Guild)
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('The user to look up transcripts for')
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName('user-id')
      .setDescription('The Discord user ID to search for (if they left the server)')
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName('thread-id')
      .setDescription('Look up a single transcript directly by its ticket thread ID')
      .setRequired(false)
  )

const hasTranscriptAccess = (
  interaction: ChatInputCommandInteraction
): boolean => {
  if (!interaction.inCachedGuild()) return false

  if (interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return true
  }

  return [roleIds.supportTeam, roleIds.moderator, roleIds.reviewer].some(
    (roleId) => interaction.member.roles.cache.has(roleId)
  )
}

const describeTicketType = (transcript: StoredTranscript): string =>
  transcript.isModTicket ? '🔴 Mod/Dispute' : '🟢 Auctions'

// Select menu descriptions are plain text (no Discord markup/timestamps), so
// format the date ourselves rather than relying on the host machine's locale.
const formatResolvedDate = (date: Date): string =>
  date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })

export const execute = async (
  client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  if (!hasTranscriptAccess(interaction)) {
    await interaction.reply({
      components: [createErrorPanel('You do not have permission to use this command!')],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const targetUser = interaction.options.getUser('user')
  const userIdOption = interaction.options.getString('user-id')?.trim()
  const threadIdOption = interaction.options.getString('thread-id')?.trim()

  if (!targetUser && !userIdOption && !threadIdOption) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'Provide a user, a user ID, or a ticket thread ID to search for.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  // Thread ID identifies a single ticket directly, so skip the select-menu
  // step and jump straight to that transcript's link.
  if (threadIdOption) {
    if (!/^\d{17,19}$/.test(threadIdOption)) {
      await interaction.reply({
        components: [createErrorPanel('Invalid thread ID format!')],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
      return
    }

    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral })

      const transcript = await getTranscript(threadIdOption)

      if (!transcript) {
        await interaction.editReply({
          components: [createErrorPanel('No transcript found for that thread ID.')],
          flags: COMPONENTS_V2_FLAGS,
        })
        return
      }

      await interaction.editReply({
        components: [
          createTranscriptPanel({
            threadName: transcript.threadName,
            isModTicket: transcript.isModTicket,
            resolvedBy: transcript.resolvedBy,
            resolvedAt: transcript.resolvedAt,
            transcriptUrl: getTranscriptUrl(transcript.transcriptId),
          }),
        ],
        flags: COMPONENTS_V2_FLAGS,
      })
    } catch (error) {
      console.error('Failed to check transcript by thread ID:', error)

      await sendErrorLog(client, 'Failed to check transcript by thread ID', error, {
        threadId: threadIdOption,
      })

      const errorReply = {
        components: [
          createErrorPanel('Failed to retrieve transcript. Please try again later.'),
        ],
      }

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ ...errorReply, flags: COMPONENTS_V2_EPHEMERAL_FLAGS })
      } else {
        await interaction.editReply({ ...errorReply, flags: COMPONENTS_V2_FLAGS })
      }
    }

    return
  }

  const userId = targetUser?.id ?? userIdOption ?? ''

  if (!/^\d{17,19}$/.test(userId)) {
    await interaction.reply({
      components: [createErrorPanel('Invalid user ID format!')],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const transcripts = await getUserTranscripts(userId)

    if (transcripts.length === 0) {
      await interaction.editReply({
        components: [
          createErrorPanel('No transcripts found for this user.'),
        ],
        flags: COMPONENTS_V2_FLAGS,
      })
      return
    }

    // Sort by generated date, newest first
    transcripts.sort(
      (a, b) => b.generatedAt.getTime() - a.generatedAt.getTime()
    )

    // Discord select menus cap out at 25 options — show the most recent ones.
    const shownTranscripts = transcripts.slice(0, MAX_SELECT_OPTIONS)

    // transcriptId (not threadId) is the identifier the URL-based transcript
    // system looks transcripts up by, so it's what the select value carries.
    const selectOptions = shownTranscripts.map((transcript) => ({
      label: transcript.threadName.substring(0, 100),
      description: `${describeTicketType(transcript)} • ${formatResolvedDate(transcript.resolvedAt)}`,
      value: transcript.transcriptId,
    }))

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_transcript')
      .setPlaceholder('Select a transcript to view')
      .addOptions(selectOptions)

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu)

    const summaryEmbed = new EmbedBuilder()
      .setTitle('📋 Ticket Transcripts')
      .setDescription(
        `Found ${transcripts.length} transcript(s) for <@${userId}>` +
          (transcripts.length > MAX_SELECT_OPTIONS
            ? `\n-# Showing the ${MAX_SELECT_OPTIONS} most recent.`
            : '')
      )
      .setColor(0x4ecdc4)
      .setTimestamp()

    await interaction.editReply({
      embeds: [summaryEmbed],
      components: [row],
    })
  } catch (error) {
    console.error('Failed to check transcripts:', error)

    await sendErrorLog(client, 'Failed to check transcripts', error, {
      userId,
    })

    const errorReply = {
      components: [
        createErrorPanel('Failed to retrieve transcripts. Please try again later.'),
      ],
    }

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ ...errorReply, flags: COMPONENTS_V2_EPHEMERAL_FLAGS })
    } else {
      await interaction.editReply({ ...errorReply, flags: COMPONENTS_V2_FLAGS })
    }
  }
}
