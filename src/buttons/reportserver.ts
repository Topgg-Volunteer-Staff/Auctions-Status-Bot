import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  Client,
} from 'discord.js'

export const button = {
  name: 'reportserver',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('modModal_reportserver') // modal custom id
    .setTitle('Report a Top.gg Server')

  const reasonInput = new TextInputBuilder()
    .setCustomId('modReason')
    .setLabel('What rule did the server break?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. spamming, dm ads, advertising')

  const entityID = new TextInputBuilder()
    .setCustomId('entityID')
    .setLabel('Server ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. 264811613708746752')

  const reasonInputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )
  const entityIDRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    entityID
  )

  modal.addComponents(reasonInputRow, entityIDRow)

  await interaction.showModal(modal)
}
