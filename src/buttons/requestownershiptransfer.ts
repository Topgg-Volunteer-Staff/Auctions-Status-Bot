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
    .setLabel('Top.gg bot/server link')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. https://top.gg/bot/id | https://top.gg/discord/servers/id')

  const userID = new TextInputBuilder()
    .setCustomId('modOwnershipUserID')
    .setLabel('User ID to transfer the bot/server to')
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
