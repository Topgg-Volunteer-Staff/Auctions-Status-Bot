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
  TextDisplayBuilder,
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
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**For bot ownership:**\nYou must be able to do one of the following:\n- Change the bot's description on the Discord Developer Portal to "Top.gg Verification".\n- Send a Direct Message through the bot.\n- Edit a bot's command or add a new custom command saying "Top.gg Verification".\n\nIf you are unable to do any of these, unfortunately we cannot transfer ownership to you.`
      ),
      new TextDisplayBuilder().setContent(
        `**For server ownership:**\n- Please send your server's invite link (e.g. .gg/dbl). We will join the server to verify ownership.`
      )
    )

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
    .setDescription(
      "Want to transfer to a team? Select yourself, and we'll help you out in the ticket!"
    )

  // Additional comments text input
  const additionalCommentsInput = new TextInputBuilder()
    .setCustomId('additionalComments')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000)
    .setPlaceholder("Any additional information you'd like to provide...")

  const additionalCommentsLabel = new LabelBuilder()
    .setLabel('Additional Comments')
    .setTextInputComponent(additionalCommentsInput)

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

  const linkLabel = new LabelBuilder()
    .setLabel('ID')
    .setTextInputComponent(idInput)

  modal.addLabelComponents(
    projectTypeLabel,
    linkLabel,
    ownershipUserLabel,
    additionalCommentsLabel
  )

  await interaction.showModal(modal)
}
