import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  Client,
  TextDisplayBuilder,
  LabelBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
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
        'Please read the decline reason carefully and only create a ticket if you believe the reviewer made a mistake during reviewing.\nPlease view our [bot guidelines](https://support.top.gg/support/solutions/articles/73000502502-bot-guidelines) for more information before creating a ticket!'
      ),
      new TextDisplayBuilder().setContent(
        '**For offline bots:**\n- Please make sure the bot is online and not in maintenance mode - you can just re-submit the bot without needing to create a ticket!'
      ),
      new TextDisplayBuilder().setContent(
        '**For clones:**\n- Please make sure you have added your own feature that is not found in the repository your bot is cloned from.\n  - E.g. If the repository has a category called Music, you cannot add more music commands. You must instead create a new category, such as Economy and then add a few economy commands.\n - Updating existing commands/the UI does not count as modifying the bot.'
      )
    )

  const reasonInput = new TextInputBuilder()
    .setCustomId('disputeID')
    .setLabel('Bot/Application ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. 264811613708746752')

  // Common dispute reasons select menu
  const reasonSelectLabel = new LabelBuilder()
    .setLabel('Reason')
    .setStringSelectMenuComponent(
      new StringSelectMenuBuilder()
        .setCustomId('disputeReason')
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel('Bot needs extra permissions')
            .setValue('extra_perms')
            .setDescription(
              'The bot requires additional permissions to function properly.'
            ),
          new StringSelectMenuOptionBuilder()
            .setLabel('Bot needs to be setup through dashboard')
            .setValue('dashboard_setup')
            .setDescription(
              'The bot requires dashboard configuration before it can be used.'
            ),
          new StringSelectMenuOptionBuilder()
            .setLabel('Bot requires code grant')
            .setValue('code_grant')
            .setDescription(
              'The bot requires a code grant to function properly.'
            ),
          new StringSelectMenuOptionBuilder()
            .setLabel('Not a clone (I added my own features)')
            .setValue('not_clone')
            .setDescription('The bot has unique features and is not a clone.'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Bot under maintenance')
            .setValue('under_maintenance')
            .setDescription('The bot is under maintenance for some time.'),
          new StringSelectMenuOptionBuilder()
            .setLabel('Wrongly reviewed')
            .setValue('wrongly_reviewed')
            .setDescription(
              'The reviewer misunderstood the bot functionality.'
            ),
          new StringSelectMenuOptionBuilder()
            .setLabel('Reviewer could not contact me')
            .setValue('could_not_contact')
            .setDescription(
              'The reviewer was not able to reach out to me about my bot.'
            ),
          new StringSelectMenuOptionBuilder()
            .setLabel('Other')
            .setValue('other')
            .setDescription('Other reason not listed above.')
        )
    )

  const reason = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Additional Details')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('Please provide additional details about your dispute...')

  const reasonInputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )

  const reasonRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reason
  )

  modal.addLabelComponents(reasonSelectLabel)
  modal.addComponents(reasonInputRow, reasonRow)
  await interaction.showModal(modal)
}
