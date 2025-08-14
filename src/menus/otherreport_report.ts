import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuInteraction,
  Client,
} from 'discord.js'

export const menu = {
  name: 'otherreport_report',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('modModal_otherreport') // modal custom id
    .setTitle('I need help with something else')

  const reasonInput = new TextInputBuilder()
    .setCustomId('modReason')
    .setLabel('How can we help?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder(
      'E.g. I need help with my account, I have a suggestion, etc.'
    )

  const reasonInputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )

  modal.addComponents(reasonInputRow)
  await interaction.showModal(modal)
}
