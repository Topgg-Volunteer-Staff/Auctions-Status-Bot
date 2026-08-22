import {
  ChannelType,
  Client,
  MessageFlags,
  StringSelectMenuInteraction,
  ThreadChannel,
} from 'discord.js'

import { channelIds } from '../globals'
import {
  buildInactiveTicketAlertMessage,
  extraTicketReminderMenuName,
  getExtraTicketReminderHours,
  parseExtraTicketReminderCustomId,
} from '../utils/tickets/checkInactiveThreads'
import {
  isStaffUserInGuild,
  scheduleExtraTicketReminder,
} from '../utils/tickets/staffTicketReminders'

export const menu = {
  name: extraTicketReminderMenuName,
}

export const execute = async (
  client: Client,
  interaction: StringSelectMenuInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return

  const request = parseExtraTicketReminderCustomId(interaction.customId)
  const hours = getExtraTicketReminderHours(interaction.values[0] ?? '')
  if (!request || hours === null) {
    await interaction.reply({
      content: 'This extra reminder selection is invalid.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (!(await isStaffUserInGuild(interaction.guild, interaction.user.id))) {
    await interaction.reply({
      content: 'Only staff members can set extra ticket reminders.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (
    request.lastStaffMemberId &&
    interaction.user.id !== request.lastStaffMemberId
  ) {
    await interaction.reply({
      content: 'Only the staff member mentioned in this alert can set an extra reminder.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const thread = await client.channels.fetch(request.threadId).catch(() => null)
  if (
    !thread ||
    thread.type !== ChannelType.PrivateThread ||
    (thread.parentId !== channelIds.modTickets &&
      thread.parentId !== channelIds.auctionsTickets)
  ) {
    await interaction.reply({
      content: 'This ticket is no longer available for an extra reminder.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const ticket = thread as ThreadChannel
  await scheduleExtraTicketReminder({
    delayMs: hours * 60 * 60 * 1000,
    threadId: ticket.id,
    threadUrl: ticket.url,
    userId: interaction.user.id,
  })

  const updatedReminder = buildInactiveTicketAlertMessage(
    ticket,
    request.idleSince,
    request.lastStaffMemberId,
    hours
  )
  const components = updatedReminder.components
  if (components) {
    await interaction.update({ components })
  } else {
    await interaction.deferUpdate()
  }

  await interaction.followUp({
    content: `I'll remind you in ${hours} hour${
      hours === 1 ? '' : 's'
    } via DMs about this ticket.`,
    flags: MessageFlags.Ephemeral,
  })
}
