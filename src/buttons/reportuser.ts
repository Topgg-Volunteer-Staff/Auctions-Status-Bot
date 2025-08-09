import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  Client,
} from 'discord.js'

export const button = {
  name: 'reportuser',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('modModal_reportuser')
    .setTitle('Report a Top.gg user')

  const reasonInput = new TextInputBuilder()
    .setCustomId('modReason')
    .setLabel('Why are you reporting this user?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. spamming, dm ads, breaking tos, etc.')

  const entityID = new TextInputBuilder()
    .setCustomId('entityID')
    .setLabel('User ID')
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
