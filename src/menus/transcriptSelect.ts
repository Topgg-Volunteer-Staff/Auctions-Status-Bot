import {
  Client,
  StringSelectMenuInteraction,
  MessageFlags,
} from 'discord.js'
import { getTranscript } from '../utils/db/transcripts'
import { sendErrorLog } from '../utils/errorLogging'
import { createErrorPanel } from '../utils/componentsV2'

export const menu = { name: 'select' }

export const execute = async (
  client: Client,
  interaction: StringSelectMenuInteraction
): Promise<void> => {
  try {
    const threadId = interaction.values[0]

    if (!threadId) {
      await interaction.reply({
        components: [createErrorPanel('Invalid selection.')],
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    const transcript = await getTranscript(threadId)

    if (!transcript) {
      await interaction.editReply({
        components: [createErrorPanel('Transcript not found.')],
      })
      return
    }

    const buffer = Buffer.from(transcript.transcriptHtml, 'utf-8')
    const fileName = `transcript-${threadId}.html`

    await interaction.editReply({
      files: [
        {
          attachment: buffer,
          name: fileName,
        },
      ],
    })
  } catch (error) {
    console.error('Failed to download transcript from menu:', error)

    await sendErrorLog(client, 'Failed to download transcript from menu', error)

    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          components: [
            createErrorPanel('Failed to download transcript. Please try again later.'),
          ],
          flags: MessageFlags.Ephemeral,
        })
      } else {
        await interaction.editReply({
          components: [
            createErrorPanel('Failed to download transcript. Please try again later.'),
          ],
        })
      }
    } catch (replyError) {
      console.error('Failed to send error reply:', replyError)
    }
  }
}
