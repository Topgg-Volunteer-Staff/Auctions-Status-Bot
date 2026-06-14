import { ButtonInteraction, Client, MessageFlags } from 'discord.js'
import {
  createDmOnResponsesScopeRow,
  getTicketDmResponsesState,
} from '../utils/tickets/dmOnResponses'

export const button = {
  name: 'dmOnResponses',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return
  if (!interaction.channel?.isThread()) return

  const [, openerId] = interaction.customId.split('_')
  if (!openerId) {
    await interaction.reply({
      content: 'This toggle is missing ticket owner information.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (interaction.user.id !== openerId) {
    await interaction.reply({
      content: 'Only the ticket opener can toggle DM responses.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const { enabled } = await getTicketDmResponsesState(
    interaction.channel.id,
    openerId
  )
  const nextEnabled = !enabled
  const content = nextEnabled
    ? 'Turn DM reminders on for just this ticket, or turn them on here and save that as your default for future tickets?'
    : 'Turn DM reminders off for just this ticket, or turn them off here and save that as your default for future tickets?'

  await interaction.reply({
    content,
    components: [createDmOnResponsesScopeRow(openerId, nextEnabled)],
    flags: MessageFlags.Ephemeral,
  })
}