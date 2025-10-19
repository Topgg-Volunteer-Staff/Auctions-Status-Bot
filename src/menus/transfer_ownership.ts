import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuInteraction,
  Client,
} from 'discord.js'
import { LabelBuilder } from '@discordjs/builders'

export const menu = {
  name: 'transfer_ownership',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('modModal_transfer_ownership') // modal custom id
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

  // Create labels with text input components
  const botOrServerLabel = new LabelBuilder()
    .setLabel('Bot/Server link')
    .setTextInputComponent(BotOrServer)

  const userIdLabel = new LabelBuilder()
    .setLabel('User ID to transfer to')
    .setTextInputComponent(userID)

  // Add label components to modal (replacing deprecated addComponents)
  modal.addLabelComponents(botOrServerLabel, userIdLabel)

  await interaction.showModal(modal)
}
