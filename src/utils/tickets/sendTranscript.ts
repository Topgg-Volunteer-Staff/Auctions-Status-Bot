import {
  User,
  ThreadChannel,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js'
import { channelIds } from '../../globals'

type SendTranscriptResult = {
  success: boolean
  error?: string
}

export const sendTranscriptDm = async (
  user: User,
  thread: ThreadChannel,
  resolvedBy: string
): Promise<SendTranscriptResult> => {
  try {
    const isModTicket = thread.parent?.id === channelIds.modTickets

    const disclaimerText = isModTicket
      ? 'These transcripts are available to yourself and our Support Associates, as well as our Moderator team and any reviewer that handled your ticket. Let us know if you have any questions or concerns.'
      : 'These transcripts are only available to yourself and the Support Associate that handled your ticket. Let us know if you have any questions or concerns.'

    const transcriptEmbed = new EmbedBuilder()
      .setTitle('📋 Ticket Transcript')
      .setDescription(`**${thread.name}**\n\n${disclaimerText}`)
      .addFields(
        {
          name: 'Ticket Type',
          value: isModTicket ? '🔴 Mod/Dispute' : '🟢 Auctions',
          inline: true,
        },
        {
          name: 'Resolved By',
          value: `<@${resolvedBy}>`,
          inline: true,
        }
      )
      .setColor(isModTicket ? 0xff6b6b : 0x4ecdc4)
      .setTimestamp()

    const transcriptButton = new ButtonBuilder()
      .setCustomId(`transcript_view_${thread.id}`)
      .setLabel('Transcript')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary)

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(transcriptButton)

    await user.send({
      embeds: [transcriptEmbed],
      components: [row],
    })

    return { success: true }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error sending DM'
    return {
      success: false,
      error: errorMessage,
    }
  }
}
