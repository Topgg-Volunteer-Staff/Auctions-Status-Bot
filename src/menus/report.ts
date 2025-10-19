import {
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuInteraction,
  Client,
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
                  .setValue('eb6bd3a320984ac0bc0f68b3d7e475e6')
                  .setDescription('Report a user.'),
                new StringSelectMenuOptionBuilder()
                  .setLabel('Bot')
                  .setValue('2ff456c1bd4545e1b7f12e6d07e6d012')
                  .setDescription('Report a bot.'),
                new StringSelectMenuOptionBuilder()
                  .setLabel('Server')
                  .setValue('8705f9f12c084938a0be8d06d4766237')
                  .setDescription('Report a server.'),
                new StringSelectMenuOptionBuilder()
                  .setLabel('Review')
                  .setValue('56425f6f71974ee995c870c1e0a31052')
                  .setDescription('Report a review on your project page.'),
                new StringSelectMenuOptionBuilder()
                  .setLabel('Other')
                  .setValue('c4cbfd581fb24e3ead3f852ff9e34b87')
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
          .setDescription('Please include any image link here.')
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId('screenshot')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('E.g. https://i.imgur.com/example.png')
          )
      )
  )
}
