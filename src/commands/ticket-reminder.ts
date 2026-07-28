import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  InteractionContextType,
  SlashCommandBuilder,
  ThreadChannel,
} from 'discord.js'
import { channelIds } from '../globals'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  createErrorPanel,
  createSuccessPanel,
} from '../utils/componentsV2'
import {
  getTicketReminderDelayLabel,
  getTicketReminderDelayMs,
  hasGlobalStaffTicketReminderPreference,
  isStaffReminderEligibleInteraction,
  removeStaffTicketReminderPreference,
  setStaffTicketReminderPreference,
  TICKET_REMINDER_DELAY_CHOICES,
} from '../utils/tickets/staffTicketReminders'

export const command = new SlashCommandBuilder()
  .setName('ticket-reminder')
  .setDescription(
    'Get a DM when the ticket user replies after your chosen delay'
  )
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
  const channel = interaction.channel
  if (!channel || channel.type !== ChannelType.PrivateThread) {
    await interaction.reply({
      components: [
        createErrorPanel('This command can only be used in a ticket thread.'),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const thread = channel as ThreadChannel
  if (
    thread.parentId !== channelIds.modTickets &&
    thread.parentId !== channelIds.auctionsTickets
  ) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'This command can only be used in mod or auctions tickets.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

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
    await removeStaffTicketReminderPreference(thread.id, interaction.user.id)
    await interaction.reply({
      components: [
        createSuccessPanel(
          'Ticket reminder disabled',
          'You will no longer receive DMs for new user replies in this ticket.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  if (await hasGlobalStaffTicketReminderPreference(interaction.user.id)) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'You already have global ticket reminders enabled. Use /ticket-reminder-global instead of opting into individual tickets.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  await setStaffTicketReminderPreference(
    thread.id,
    interaction.user.id,
    delayMs
  )

  await interaction.reply({
    components: [
      createSuccessPanel(
        'Ticket reminder updated',
        `You will receive a DM ${delayLabel.toLowerCase()} after the latest user message in this ticket unless you reply before then.`
      ),
    ],
    flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
  })
}
