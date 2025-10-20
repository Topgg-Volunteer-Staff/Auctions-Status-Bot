import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  Client,
  TextDisplayBuilder,
  LabelBuilder,
} from 'discord.js'

export const button = {
  name: 'disputeCreate',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('disputeDecline')
    .setTitle('Dispute a bot decline')
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'Please read the decline reason carefully and only create a ticket if you believe the reviewer made a mistake during reviewing.\nPlease view our [bot guidelines](https://support.top.gg/support/solutions/articles/73000502502-bot-guidelines) for more information before creating a ticket!\n\n**For offline bots:**\n- Please make sure the bot is online and not in maintenance mode - you can just re-submit the bot without needing to create a ticket!\n\n**For clones:**\n- Please make sure you have added your own feature that is not found in the repository your bot is cloned from.\n  - E.g. If the repository has a category called Music, you cannot add more music commands. You must instead create a new category, such as Economy and then add a few economy commands.\n - Updating existing commands/the UI does not count as modifying the bot.'
      )
    )

  const reasonInput = new TextInputBuilder()
    .setCustomId('disputeID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. 264811613708746752')

  const reasonInputLabel = new LabelBuilder()
    .setLabel('Bot/Application ID')
    .setTextInputComponent(reasonInput)

  const reason = new TextInputBuilder()
    .setCustomId('reason')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('Please provide additional details about your dispute...')

  const reasonLabel = new LabelBuilder()
    .setLabel('Additional Details')
    .setTextInputComponent(reason)

  modal.addLabelComponents(reasonInputLabel, reasonLabel)
  await interaction.showModal(modal)
}
