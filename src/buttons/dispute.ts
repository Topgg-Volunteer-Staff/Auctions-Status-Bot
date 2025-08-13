import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  Client,
} from 'discord.js'

export const button = {
  name: 'dispute',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('disputeDecline') // modal custom id
    .setTitle('Dispute a decline on a bot or server')

  const reasonInput = new TextInputBuilder()
    .setCustomId('disputeID')
    .setLabel('ID of the Bot/Server that was declined')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. 264811613708746752')

  const reason = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Why are you disputing?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. the review was not done correctly because...')

  const reasonInputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )

  const reasonRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reason
  )

  modal.addComponents(reasonInputRow, reasonRow)
  await interaction.showModal(modal)
}
