import {
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuInteraction,
  Client,
  FileUploadBuilder,
} from 'discord.js'

export const menu = {
  name: 'report',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  await interaction.showModal(
    new ModalBuilder()
      .setTitle('Report')
      .setCustomId('modModal_report')
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('Select report type')
          .setStringSelectMenuComponent(
            new StringSelectMenuBuilder()
              .setCustomId('reportType')
              .addOptions(
                new StringSelectMenuOptionBuilder()
                  .setLabel('User')
                  .setValue('user')
                  .setDescription('Report a user.'),
                new StringSelectMenuOptionBuilder()
                  .setLabel('Bot')
                  .setValue('bot')
                  .setDescription('Report a bot.'),
                new StringSelectMenuOptionBuilder()
                  .setLabel('Server')
                  .setValue('server')
                  .setDescription('Report a server.'),
                new StringSelectMenuOptionBuilder()
                  .setLabel('Review')
                  .setValue('review')
                  .setDescription('Report a review on your project page.'),
                new StringSelectMenuOptionBuilder()
                  .setLabel('Other')
                  .setValue('other')
                  .setDescription('Report anything else.')
              )
          )
      )
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('ID')
          .setDescription("Please put the ID of the item you'd like to report.")
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('entityID')
              .setStyle(TextInputStyle.Short)
          )
      )
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('Reason')
          .setDescription('Please give a detailed reason for your report.')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('reason')
              .setStyle(TextInputStyle.Paragraph)
          )
      )
      .addLabelComponents(
        new LabelBuilder()
          .setLabel('Screenshots')
          .setDescription('Please upload relevant images.')
          .setFileUploadComponent(
            new FileUploadBuilder()
              .setCustomId('screenshot')
              .setMinValues(1)
              .setMaxValues(5)
              .setRequired(true)
          )
      )
  )
}
