import {
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  createErrorPanel,
} from '../utils/componentsV2'
import { getUserTranscripts } from '../utils/db/transcripts'
import { roleIds } from '../globals'
import { sendErrorLog } from '../utils/errorLogging'

export const command = new SlashCommandBuilder()
  .setName('check-transcript')
  .setDescription('View transcripts for a specific user')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName('user-id')
      .setDescription('The Discord user ID to search for')
      .setRequired(true)
  )

export const execute = async (
  client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  // Check if user has support team role
  if (!interaction.memberPermissions?.has('ManageMessages')) {
    if (
      !interaction.member ||
      typeof interaction.member === 'string' ||
      !('roles' in interaction.member) ||
      !('cache' in interaction.member.roles)
    ) {
      await interaction.reply({
        components: [createErrorPanel('You do not have permission to use this command!')],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
      return
    }

    const roles = interaction.member.roles as { cache: Map<string, unknown> }
    const hasRole =
      roles.cache.has(roleIds.supportTeam) ||
      roles.cache.has(roleIds.moderator) ||
      roles.cache.has(roleIds.reviewer)

    if (!hasRole) {
      await interaction.reply({
        components: [createErrorPanel('You do not have permission to use this command!')],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
      return
    }
  }

  const userId = interaction.options.getString('user-id', true)

  // Validate user ID format
  if (!/^\d{17,19}$/.test(userId)) {
    await interaction.reply({
      components: [createErrorPanel('Invalid user ID format!')],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  try {
    await interaction.deferReply({ ephemeral: true })

    const transcripts = await getUserTranscripts(userId)

    if (transcripts.length === 0) {
      await interaction.editReply({
        components: [
          createErrorPanel('No transcripts found for this user.'),
        ],
      })
      return
    }

    // Sort by generated date, newest first
    transcripts.sort(
      (a, b) => b.generatedAt.getTime() - a.generatedAt.getTime()
    )

    // Create embeds for each transcript
    const embeds = transcripts.slice(0, 10).map((transcript) => {
      const embed = new EmbedBuilder()
        .setTitle(transcript.threadName)
        .setDescription(`**Ticket Type:** ${transcript.isModTicket ? 'Mod/Dispute' : 'Auctions'}`)
        .addFields(
          {
            name: 'Thread ID',
            value: transcript.threadId,
            inline: true,
          },
          {
            name: 'Resolved By',
            value: `<@${transcript.resolvedBy}>`,
            inline: true,
          },
          {
            name: 'Resolved At',
            value: `<t:${Math.floor(transcript.resolvedAt.getTime() / 1000)}:f>`,
            inline: false,
          }
        )
        .setColor(transcript.isModTicket ? 0xff6b6b : 0x4ecdc4)
        .setTimestamp(transcript.generatedAt)

      return embed
    })

    // Create buttons to download transcripts
    const buttons = transcripts.slice(0, 5).map((transcript) => {
      const label = transcript.threadName.substring(0, 80)
      return new ButtonBuilder()
        .setCustomId(`transcript_download_${transcript.threadId}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Secondary)
    })

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)

    await interaction.editReply({
      embeds: embeds,
      components: buttons.length > 0 ? [row] : [],
    })
  } catch (error) {
    console.error('Failed to check transcripts:', error)

    await sendErrorLog(client, 'Failed to check transcripts', error, {
      userId,
    })

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        components: [
          createErrorPanel('Failed to retrieve transcripts. Please try again later.'),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
    } else {
      await interaction.editReply({
        components: [
          createErrorPanel('Failed to retrieve transcripts. Please try again later.'),
        ],
      })
    }
  }
}
