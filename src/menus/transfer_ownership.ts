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

  // ID input – requested customId
  const idInput = new TextInputBuilder()
    .setCustomId('46dd2203eef64d4c9ec44536f3756cdc')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('E.g. 264445053596991498')

  // User select to choose the transferee
  const ownershipUserLabel = new LabelBuilder()
    .setLabel('User to transfer to')
    .setUserSelectMenuComponent(
      new UserSelectMenuBuilder().setCustomId('ownershipUserSelect')
    )

  // Project type select – requested ids/values
  const projectTypeLabel = new LabelBuilder()
    .setLabel('Select project type')
    .setStringSelectMenuComponent(
      new StringSelectMenuBuilder()
        .setCustomId('60d695abbca14599914cbc60e4d49488')
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel('Bot')
            .setValue('1b75e705bb85414a92d6041ae3760fd7'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Server')
            .setValue('3a416a1c4df443f6b8498bf7706f0c25')
        )
    )

  // Components in order: project type select → ID → user select
  const linkLabel = new LabelBuilder()
    .setLabel('ID')
    .setTextInputComponent(idInput)

  modal.addLabelComponents(projectTypeLabel, linkLabel, ownershipUserLabel)

  // Add informational text display
  modal.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      'To prove you are the owner of the project, you must be able to do one of these 3 things:\n1. Change your bot\'s "about me" to include "top.gg verification" from the Discord Developer Portal.\n2. Send a Direct Message to the Moderator (who will help you in the ticket) through the bot.\n3. Making changes on code (botinfo, custom command, etc.)'
    )
  )

  await interaction.showModal(modal)
}
