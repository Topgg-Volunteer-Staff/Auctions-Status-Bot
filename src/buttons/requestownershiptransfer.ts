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

  const userID = new TextInputBuilder()
    .setCustomId('modOwnershipUserID')
    .setLabel('Discord ID of who the entity is moving too')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('1376991905191039006')

  const BotOrServer = new TextInputBuilder()
    .setCustomId('modOwnershipBotOrServer')
    .setLabel('Bot/Server ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('1376991905191039006')

  const userIdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    userID
  )

  const BotOrServerRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    BotOrServer
  )

  modal.addComponents(userIdRow, BotOrServerRow)

  await interaction.showModal(modal)
}
