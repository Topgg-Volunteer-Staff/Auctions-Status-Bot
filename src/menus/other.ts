import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuInteraction,
  Client,
  LabelBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  FileUploadBuilder,
} from 'discord.js'

export const menu = {
  name: 'other',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('modModal_other') // modal custom id
    .setTitle('I need help with something else')
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'For auction related help, create a ticket in <#1012032743250595921> instead.'
      )
    )

  // Select menu for category selection
  const categorySelectLabel = new LabelBuilder()
    .setLabel('Select category')
    .setStringSelectMenuComponent(
      new StringSelectMenuBuilder()
        .setCustomId('categoryType')
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel('Account Issues')
            .setValue('account')
            .setDescription('Problems with your Top.gg account.'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Ban Appeal')
            .setValue('ban_appeal')
            .setDescription('Appeal a ban.'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Bug Report')
            .setValue('bug')
            .setDescription('Report a bug or technical issue.'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Project Listing Issues')
            .setValue('project_listing')
            .setDescription('Problems with your project listing.'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Unable to Vote')
            .setValue('unable_to_vote')
            .setDescription('Unable to vote on a project.'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Other')
            .setValue('other')
            .setDescription('Something else not listed above.')
        )
    )

  // Main reason text input
  const reasonLabel = new LabelBuilder()
    .setLabel('How can we help?')
    .setTextInputComponent(
      new TextInputBuilder()
        .setCustomId('modReason')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
        .setPlaceholder('Please give as much detail as possible!')
    )

  // Optional image upload (non-required)
  const imagesLabel = new LabelBuilder()
    .setLabel('Images')
    .setDescription('Optional: upload one or more image files (png/jpg).')
    .setFileUploadComponent(
      new FileUploadBuilder()
        .setCustomId('screenshot')
        .setMinValues(0)
        .setMaxValues(5)
        .setRequired(false)
    )

  modal.addLabelComponents(categorySelectLabel, reasonLabel, imagesLabel)
  await interaction.showModal(modal)
}
