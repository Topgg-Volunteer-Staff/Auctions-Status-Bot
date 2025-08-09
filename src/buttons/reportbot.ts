import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  Client,
} from 'discord.js'

export const button = {
  name: 'reportbot',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('modModal_reportbot') // modal custom id
    .setTitle('Report a Top.gg bot')

  const entityID = new TextInputBuilder()
    .setCustomId('entityID')
    .setLabel('𝖳𝗈𝗉.𝗀𝗀 𝖻𝗈𝗍 𝗅𝗂𝗇𝗄')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g.https://top.gg/bot/id')

  const reasonInput = new TextInputBuilder()
    .setCustomId('modReason')
    .setLabel('Why 𝖺re 𝗒ou 𝗋eporting 𝗍his 𝖻ot?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. spamming, invalid invite, breaking tos, etc.')

  const screenshotInput = new TextInputBuilder()
    .setCustomId('botScreenshot')
    .setLabel('Any 𝗌creenshot 𝗅ink')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
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
