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

  const screenshotInput = new TextInputBuilder()
    .setCustomId('reviewScreenshot')
    .setLabel('Review 𝗌creenshot 𝗅ink')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. https://i.imgur.com/example.png')

  const reasonInput = new TextInputBuilder()
    .setCustomId('modReason')
    .setLabel('Why 𝖺re 𝗒ou 𝗋eporting 𝗍his 𝗋eview?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. invalid review, breaking tos, etc.')

  const entityID = new TextInputBuilder()
    .setCustomId('entityID')
    .setLabel('𝖳𝗈𝗉․𝗀𝗀 𝖻𝗈𝗍/𝗌𝖾𝗋𝗏𝖾𝗋 𝗅𝗂𝗇𝗄')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('https://top.gg/bot/id | https://top.gg/discord/servers/id')

  const screenshotRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    screenshotInput
  )
  const reasonInputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )
  const entityIDRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    entityID
  )

  modal.addComponents(screenshotRow, reasonInputRow, entityIDRow)

  await interaction.showModal(modal)
}
