import {
  ChatInputCommandInteraction,
  Client,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { errorEmbed, successEmbed } from '../utils/embeds'
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
      embeds: [errorEmbed('Only staff members can use this command.')],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const delayChoice = interaction.options.getString('delay', true)
  const delayMs = getTicketReminderDelayMs(delayChoice)
  const delayLabel = getTicketReminderDelayLabel(delayChoice)

  if (!delayLabel) {
    await interaction.reply({
      embeds: [errorEmbed('That reminder delay is not valid.')],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (delayMs === null) {
    await removeGlobalStaffTicketReminderPreference(interaction.user.id)
    await interaction.reply({
      embeds: [
        successEmbed(
          'Global ticket reminder disabled',
          'You will no longer receive automatic DMs for tickets where you are the primary staff handler.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await setGlobalStaffTicketReminderPreference(interaction.user.id, delayMs)

  await interaction.reply({
    embeds: [
      successEmbed(
        'Global ticket reminder updated',
        `You will receive a DM ${delayLabel.toLowerCase()} after the latest user message in tickets where you are the primary staff handler unless you reply before then.`
      ),
    ],
    flags: MessageFlags.Ephemeral,
  })
}