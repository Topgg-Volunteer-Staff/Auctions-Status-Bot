import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuInteraction,
  Client,
} from 'discord.js'

export const menu = {
  name: 'reportuser_user',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('modModal_reportuser')
    .setTitle('Report a Top.gg user')

  const entityID = new TextInputBuilder()
    .setCustomId('entityID')
    .setLabel('User ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. 264811613708746752')

  const reasonInput = new TextInputBuilder()
    .setCustomId('modReason')
    .setLabel('Reason')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. spamming, dm ads, breaking tos, etc.')

  const screenshotInput = new TextInputBuilder()
    .setCustomId('Screenshot')
    .setLabel('Screenshots')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(1000)
    .setPlaceholder('E.g. https://i.imgur.com/example.png')

  const entityIDRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    entityID
  )
  const reasonInputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )
  const screenshotRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    screenshotInput
  )

  modal.addComponents(entityIDRow, reasonInputRow, screenshotRow)

  await interaction.showModal(modal)
}
