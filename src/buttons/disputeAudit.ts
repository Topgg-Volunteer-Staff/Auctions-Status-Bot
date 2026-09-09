import { ButtonInteraction, Client, ThreadChannel } from 'discord.js'

import { resolvedFlag } from '../globals'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
  createSuccessPanel,
} from '../utils/componentsV2'
import { recordDisputeAudit } from '../utils/db/disputeAudits'
import { sendErrorLog } from '../utils/errorLogging'
import { DISPUTE_AUDIT_BUTTON } from '../utils/tickets/disputeAuditPrompt'
import { resolveTicket } from '../utils/tickets/resolveTicket'

export const button = {
  name: DISPUTE_AUDIT_BUTTON,
}

export const execute = async (
  client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  const [, answer, threadId] = interaction.customId.split('_')

  if ((answer !== 'yes' && answer !== 'no') || !threadId) return

  const thread = await interaction.guild?.channels
    .fetch(threadId)
    .catch(() => null)

  if (!(thread instanceof ThreadChannel) || !thread.parent) {
    await interaction.update({
      components: [
        createErrorPanel(
          'Ticket unavailable',
          'This ticket could not be found anymore, so nothing was resolved.'
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  if (thread.name.startsWith(resolvedFlag)) {
    await interaction.update({
      components: [createErrorPanel('This ticket is already resolved!')],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const reviewerMistake = answer === 'yes'

  await interaction.update({
    components: [
      createSuccessPanel(
        `Recorded: ${reviewerMistake ? 'Yes' : 'No'}`,
        'Resolving the ticket and sending transcripts...'
      ),
    ],
    flags: COMPONENTS_V2_FLAGS,
  })

  try {
    await recordDisputeAudit({
      threadId: thread.id,
      threadName: thread.name,
      reviewerMistake,
      answeredByUserId: interaction.user.id,
      answeredAt: interaction.createdAt,
    })
  } catch (error) {
    await sendErrorLog(client, 'Failed to record dispute audit answer', error, {
      threadId: thread.id,
      threadName: thread.name,
      userId: interaction.user.id,
    }).catch(() => void 0)
  }

  try {
    await resolveTicket({
      client,
      thread,
      parentId: thread.parent.id,
      resolvedByUserId: interaction.user.id,
      resolvedAt: interaction.createdAt,
      command: 'resolve',
      announce: (components) =>
        thread.send({
          components,
          flags: COMPONENTS_V2_FLAGS,
          allowedMentions: { parse: [] },
        }),
    })
  } catch (error) {
    console.error('Failed to resolve dispute ticket:', error)

    await interaction
      .followUp({
        components: [
          createErrorPanel(
            'Failed to resolve ticket',
            'Your audit answer was saved. Please try `/resolve` again.'
          ),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
      .catch(() => void 0)
  }
}
