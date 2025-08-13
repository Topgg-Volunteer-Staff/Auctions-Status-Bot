import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  Client,
} from 'discord.js'

export const button = {
  name: 'otherreport',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('modModal_otherreport') // modal custom id
    .setTitle('I need help with something else')

  const reasonInput = new TextInputBuilder()
    .setCustomId('modReason')
    .setLabel('What 𝖽o 𝗒ou 𝗇eed 𝗁elp 𝗐ith sir?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)

  const reasonInputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )

  modal.addComponents(reasonInputRow)
  await interaction.showModal(modal)
}
