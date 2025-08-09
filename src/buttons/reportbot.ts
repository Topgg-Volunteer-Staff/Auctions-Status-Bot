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

  const reasonInput = new TextInputBuilder()
    .setCustomId('modReason')
    .setLabel('𝖶𝗁𝗒 𝖺𝗋𝖾 𝗒𝗈𝗎 𝗋𝖾𝗉𝗈𝗋𝗍𝗂𝗇𝗀 𝗍𝗁𝗂𝗌 𝖻𝗈𝗍?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. spamming, invalid invite, breaking tos, etc.')

  const entityID = new TextInputBuilder()
    .setCustomId('entityID')
    .setLabel('𝖳𝗈𝗉.𝗀𝗀 𝖻𝗈𝗍 𝗅𝗂𝗇𝗄')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. https://top.gg/bot/id')

  const reasonInputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )
  const entityIDRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    entityID
  )

  modal.addComponents(reasonInputRow, entityIDRow)

  await interaction.showModal(modal)
}
