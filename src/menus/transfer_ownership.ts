import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuInteraction,
  Client,
  LabelBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
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
      new UserSelectMenuBuilder()
        .setCustomId('ownershipUserSelect')
        .setPlaceholder('Select a user')
        .setMinValues(1)
        .setMaxValues(1)
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

  // Then the link input
  const linkLabel = new LabelBuilder()
    .setLabel('ID')
    .setTextInputComponent(BotOrServer)

  // Then the user id input
  modal.addLabelComponents(ownershipTypeLabel, linkLabel, ownershipUserLabel)

  await interaction.showModal(modal)
}
