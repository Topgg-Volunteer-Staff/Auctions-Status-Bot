import {
  ChatInputCommandInteraction,
  Client,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  createErrorPanel,
  createSuccessPanel,
} from '../utils/componentsV2'
import {
  getTicketReminderDelayLabel,
  getTicketReminderDelayMs,
  isStaffReminderEligibleInteraction,
  removeGlobalStaffTicketReminderPreference,
  setGlobalStaffTicketReminderPreference,
  TICKET_REMINDER_DELAY_CHOICES,
} from '../utils/tickets/staffTicketReminders'

export const command = new SlashCommandBuilder()
  .setName('ticket-reminder-global')
  .setDescription('Get DMs for tickets where you are the primary staff handler')
  .addStringOption((option) => {
    option
      .setName('delay')
      .setDescription('How long to wait after the latest user message')
      .setRequired(true)

    for (const choice of TICKET_REMINDER_DELAY_CHOICES) {
      option.addChoices({ name: choice.name, value: choice.value })
    }

    return option
  })
  .setContexts(InteractionContextType.Guild)

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  if (!(await isStaffReminderEligibleInteraction(interaction))) {
    await interaction.reply({
      components: [
        createErrorPanel('Only staff members can use this command.'),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const delayChoice = interaction.options.getString('delay', true)
  const delayMs = getTicketReminderDelayMs(delayChoice)
  const delayLabel = getTicketReminderDelayLabel(delayChoice)

  if (!delayLabel) {
    await interaction.reply({
      components: [createErrorPanel('That reminder delay is not valid.')],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  if (delayMs === null) {
    await removeGlobalStaffTicketReminderPreference(interaction.user.id)
    await interaction.reply({
      components: [
        createSuccessPanel(
          'Global ticket reminder disabled',
          'You will no longer receive automatic DMs for tickets where you are the primary staff handler.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  await setGlobalStaffTicketReminderPreference(interaction.user.id, delayMs)

  await interaction.reply({
    components: [
      createSuccessPanel(
        'Global ticket reminder updated',
        `You will receive a DM ${delayLabel.toLowerCase()} after the latest user message in tickets where you are the primary staff handler unless you reply before then.`
      ),
    ],
    flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
  })
}
