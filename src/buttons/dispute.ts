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
    .setCustomId('disputeReason')
    .setLabel('Why are you appealing this decline?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. it was an unfair review, because...')

  const reasonInputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )

  modal.addComponents(reasonInputRow)
  await interaction.showModal(modal)
}
