import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  Client,
} from 'discord.js'

export const button = {
  name: 'reportreview',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('modModal_reportreview')
    .setTitle('Report a Top.gg review')

  const reasonInput = new TextInputBuilder()
    .setCustomId('modReason')
    .setLabel('Why are you reporting this review?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. invalid review, breaking tos, etc.')

  const entityID = new TextInputBuilder()
    .setCustomId('entityID')
    .setLabel('Top․gg 𝖻ot/server link')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. https://top.gg/bot/id | https://top.gg/discord/servers/id')

  const reasonInputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )
  const entityIDRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    entityID
  )

  modal.addComponents(reasonInputRow, entityIDRow)

  await interaction.showModal(modal)
}
