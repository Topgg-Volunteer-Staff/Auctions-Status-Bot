import {
  ModalBuilder,
  StringSelectMenuInteraction,
  Client,
  LabelBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
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
    .setCustomId('projectID')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('E.g. 264445053596991498')

  // User select to choose the transferee
  const ownershipUserLabel = new LabelBuilder()
    .setLabel('User to transfer to')
    .setUserSelectMenuComponent(
      new UserSelectMenuBuilder()
        .setCustomId('ownershipUserSelect')
        .setMinValues(1)
        .setMaxValues(1)
    )

  // Project type select – requested ids/values
  const projectTypeLabel = new LabelBuilder()
    .setLabel('Select project type')
    .setStringSelectMenuComponent(
      new StringSelectMenuBuilder()
        .setCustomId('ownershipType')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Bot').setValue('bot'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Server')
            .setValue('server')
        )
    )

  // Components in order: project type select → ID → user select
  const linkLabel = new LabelBuilder()
    .setLabel('ID')
    .setTextInputComponent(idInput)

  modal.addLabelComponents(projectTypeLabel, linkLabel, ownershipUserLabel)

  await interaction.showModal(modal)
}
