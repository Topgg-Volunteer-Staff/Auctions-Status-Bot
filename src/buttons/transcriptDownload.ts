import {
  Client,
  ButtonInteraction,
  MessageFlags,
} from 'discord.js'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  createErrorPanel,
} from '../utils/componentsV2'
import { getTranscript } from '../utils/db/transcripts'
import { sendErrorLog } from '../utils/errorLogging'

export const button = { name: 'transcript' }

export const execute = async (
  client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  const threadId = interaction.customId.replace('transcript_view_', '')

  try {
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
    console.error('Failed to download transcript:', error)

    await sendErrorLog(client, 'Failed to download transcript', error, {
      threadId,
    })

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        components: [
          createErrorPanel('Failed to download transcript. Please try again later.'),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
    } else {
      await interaction.editReply({
        components: [
          createErrorPanel('Failed to download transcript. Please try again later.'),
        ],
      })
    }
  }
}
