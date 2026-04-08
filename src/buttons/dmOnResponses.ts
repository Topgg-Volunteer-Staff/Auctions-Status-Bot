import { ButtonInteraction, Client, MessageFlags } from 'discord.js'
import {
  createDmOnResponsesRow,
  getTicketDmDeliveryStatus,
  toggleTicketDmResponses,
  updateDmResponseEmbed,
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

  const enabled = await toggleTicketDmResponses(interaction.channel.id, openerId)
  const deliveryStatus = getTicketDmDeliveryStatus(interaction.channel.id)

  await interaction.update({
    embeds: [updateDmResponseEmbed(openerId, enabled, deliveryStatus)],
    components: [createDmOnResponsesRow(openerId, enabled)],
  })
}