import {
  ModalBuilder,
  StringSelectMenuInteraction,
  Client,
  LabelBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'

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
    .setLabel('Bot/Server ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. 264445053596991498')

  // User select to choose the transferee
  const ownershipUserLabel = new LabelBuilder()
    .setLabel('User to transfer to')
    .setUserSelectMenuComponent(
      new UserSelectMenuBuilder().setCustomId('ownershipUserSelect')
    )

  // Ownership type select
  const ownershipTypeLabel = new LabelBuilder()
    .setLabel('Select type')
    .setStringSelectMenuComponent(
      new StringSelectMenuBuilder()
        .setCustomId('ownershipType')
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel('Bot')
            .setValue('bot')
            .setDescription('Transfer a bot.'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Server')
            .setValue('server')
            .setDescription('Transfer a server.')
        )
    )

  // Components in order: type select → link ID → user select
  const linkLabel = new LabelBuilder()
    .setLabel('ID')
    .setTextInputComponent(BotOrServer)

  modal.addLabelComponents(ownershipTypeLabel, linkLabel, ownershipUserLabel)

  // Add informational text display
  modal.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      'To prove you are the owner of the project, you must be able to do one of these 3 things:\n1. Change your bot\'s "about me" to include "top.gg verification" from the Discord Developer Portal.\n2. Send a Direct Message to the Moderator (who will help you in the ticket) through the bot.\n3. Making changes on code (botinfo, custom command, etc.)'
    )
  )

  await interaction.showModal(modal)
}
