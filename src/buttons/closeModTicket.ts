import {
  ButtonInteraction,
  ChannelType,
  Client,
  PermissionsBitField,
} from 'discord.js'
import { successEmbed } from '../utils/embeds'

export const button = {
  customId: /^closeModTicket_/,
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return

  const thread = interaction.channel
  if (!thread || thread.type !== ChannelType.PrivateThread) {
    await interaction.reply({
      content: 'This button must be used inside a private thread.',
      ephemeral: true,
    })
    return
  }

  const [, userId] = interaction.customId.split('_')

  const isOpener = interaction.user.id === userId
  const isModerator = interaction.member.permissions.has(PermissionsBitField.Flags.ManageThreads)

  if (!isOpener && !isModerator) {
    await interaction.reply({
      content: 'You are not allowed to close this ticket.',
      ephemeral: true,
    })
    return
  }

  try {
    await thread.setLocked(true, 'Ticket closed')
    await thread.setArchived(true, 'Ticket closed by user')
    await interaction.reply({
      embeds: [successEmbed('Ticket closed!', 'This thread has been locked and archived.')],
    })
  } catch (err) {
    console.error('Failed to close thread:', err)
    await interaction.reply({
      content: 'Something went wrong while closing the ticket.',
      ephemeral: true,
    })
  }
  return
}

