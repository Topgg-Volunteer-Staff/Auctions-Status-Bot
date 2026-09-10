import {
  Client,
  StringSelectMenuInteraction,
  MessageFlags,
} from 'discord.js'
import { getTranscriptById } from '../utils/db/transcripts'
import { createTranscriptPanel } from '../utils/tickets/sendTranscript'
import { getTranscriptUrl } from '../utils/webServer'
import { sendErrorLog } from '../utils/errorLogging'
import { COMPONENTS_V2_FLAGS, createErrorPanel } from '../utils/componentsV2'

export const menu = { name: 'select' }

export const execute = async (
  client: Client,
  interaction: StringSelectMenuInteraction
): Promise<void> => {
  try {
    const transcriptId = interaction.values[0]

    if (!transcriptId) {
      await interaction.reply({
        components: [createErrorPanel('Invalid selection.')],
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const transcript = await getTranscriptById(transcriptId)

    if (!transcript) {
      await interaction.editReply({
        components: [createErrorPanel('Transcript not found.')],
      })
      return
    }

    // Link to the hosted transcript instead of attaching the raw HTML —
    // avoids Discord's upload size limit and matches how the resolve/DM flow
    // shares transcripts.
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
    console.error('Failed to open transcript from menu:', error)

    await sendErrorLog(client, 'Failed to open transcript from menu', error)

    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          components: [
            createErrorPanel('Failed to open transcript. Please try again later.'),
          ],
          flags: MessageFlags.Ephemeral,
        })
      } else {
        await interaction.editReply({
          components: [
            createErrorPanel('Failed to open transcript. Please try again later.'),
          ],
        })
      }
    } catch (replyError) {
      console.error('Failed to send error reply:', replyError)
    }
  }
}
