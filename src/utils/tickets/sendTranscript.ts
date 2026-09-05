import { User, ThreadChannel, EmbedBuilder } from 'discord.js'
import { channelIds } from '../../globals'

type SendTranscriptResult = {
  success: boolean
  error?: string
}

export const sendTranscriptDm = async (
  user: User,
  thread: ThreadChannel,
  transcriptHtml: string
): Promise<SendTranscriptResult> => {
  try {
    const isModTicket = thread.parent?.id === channelIds.modTickets

    const dmMessage = isModTicket
      ? 'These transcripts are available to yourself and our Support Associates, as well as our Moderator team and any reviewer that handled your ticket. Let us know if you have any questions or concerns.'
      : 'These transcripts are only available to yourself and the Support Associate that handled your ticket. Let us know if you have any questions or concerns.'

    const transcriptEmbed = new EmbedBuilder()
      .setTitle('📋 Your Ticket Transcript')
      .setDescription(thread.name)
      .addFields({
        name: 'Ticket Type',
        value: isModTicket ? '🔴 Mod/Dispute' : '🟢 Auctions',
        inline: true,
      })
      .setColor(isModTicket ? 0xff6b6b : 0x4ecdc4)
      .setTimestamp()
      .setFooter({ text: dmMessage })

    // Create buffer from HTML string
    const buffer = Buffer.from(transcriptHtml, 'utf-8')
    const fileName = `transcript-${thread.id}.html`

    await user.send({
      embeds: [transcriptEmbed],
      files: [
        {
          attachment: buffer,
          name: fileName,
        },
      ],
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
