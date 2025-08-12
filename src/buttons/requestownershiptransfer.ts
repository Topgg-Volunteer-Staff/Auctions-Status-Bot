import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  Client,
} from 'discord.js'

export const button = {
  name: 'requestownershiptransfer',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('modModal_requestownershiptransfer') // modal custom id
    .setTitle('Request an ownership transfer')

  const BotOrServer = new TextInputBuilder()
    .setCustomId('modOwnershipBotOrServer')
    .setLabel('𝖳𝗈𝗉.𝗀𝗀 𝖻𝗈𝗍/𝗌𝖾𝗋𝗏𝖾𝗋 𝗅𝗂𝗇𝗄')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('https://top.gg/bot/id | https://top.gg/discord/servers/id')

  const userID = new TextInputBuilder()
    .setCustomId('modOwnershipUserID')
    .setLabel('𝖴𝗌𝖾𝗋 𝖨𝖣 𝗍𝗈 𝗍𝗋𝖺𝗇𝗌𝖿𝖾𝗋 𝗍𝗈')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. 1376991905191039006')

  const userIdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    userID
  )

  const BotOrServerRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    BotOrServer
  )

  modal.addComponents(userIdRow, BotOrServerRow)

  await interaction.showModal(modal)
}
