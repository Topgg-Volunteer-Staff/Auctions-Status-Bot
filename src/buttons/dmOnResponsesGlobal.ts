import { ButtonInteraction, Client, MessageFlags } from 'discord.js'
import { setTicketDmResponses } from '../utils/tickets/dmOnResponses'

export const button = {
  name: 'dmOnResponsesGlobal',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return
  if (!interaction.channel?.isThread()) return

  const [, action, openerId] = interaction.customId.split('_')
  if (!openerId || (action !== 'enable' && action !== 'disable')) {
    await interaction.reply({
      content: 'This DM preference action is missing ticket owner information.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (interaction.user.id !== openerId) {
    await interaction.reply({
      content: 'Only the ticket opener can change DM responses.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const enabled = action === 'enable'
  await setTicketDmResponses(interaction.channel.id, openerId, enabled, 'global')

  await interaction.update({
    content: enabled
      ? 'DM reminders are now on for this ticket, and that has been saved as your default for future tickets.'
      : 'DM reminders are now off for this ticket, and that has been saved as your default for future tickets.',
    components: [],
  })
}