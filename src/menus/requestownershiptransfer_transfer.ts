import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuInteraction,
  Client,
} from 'discord.js'

export const menu = {
  name: 'requestownershiptransfer_transfer',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('modModal_requestownershiptransfer') // modal custom id
    .setTitle('Request an ownership transfer')

  const BotOrServer = new TextInputBuilder()
    .setCustomId('modOwnershipBotOrServer')
    .setLabel('Bot/Server link')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('https://top.gg/bot/id | https://top.gg/discord/servers/id')

  const userID = new TextInputBuilder()
    .setCustomId('modOwnershipUserID')
    .setLabel('User ID to transfer to')
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
