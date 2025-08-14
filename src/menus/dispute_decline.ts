import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuInteraction,
  Client,
} from 'discord.js'

export const menu = {
  name: 'dispute_decline',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('disputeDecline') // modal custom id
    .setTitle('Dispute a bot decline')

  const reasonInput = new TextInputBuilder()
    .setCustomId('disputeID')
    .setLabel('Bot/Application ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. 264811613708746752')

  const reason = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. the review was incorrect because...')

  const reasonInputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )

  const reasonRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reason
  )

  modal.addComponents(reasonInputRow, reasonRow)
  await interaction.showModal(modal)
}
