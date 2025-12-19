import {
  ChannelType,
  Client,
  CommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
  ThreadChannel,
  MessageFlags,
} from 'discord.js'
import { errorEmbed, successEmbed } from '../utils/embeds'
import { channelIds } from '../globals'

export const threadAlerts = new Map<string, Set<string>>()

export const command = new SlashCommandBuilder()
  .setName('alert')
  .setDescription('Get notified when the ticket creator sends a new message')
  .setContexts(InteractionContextType.Guild)

export const execute = async (
  _client: Client,
  interaction: CommandInteraction
): Promise<void> => {
  const ch = interaction.channel
  if (!ch || ch.type !== ChannelType.PrivateThread) {
    await interaction.reply({
      embeds: [errorEmbed('This command can only be used in a thread!')],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const thread = ch as ThreadChannel

  const parent = thread.parent
  if (!parent || parent.id !== channelIds.modTickets) {
    await interaction.reply({
      embeds: [
        errorEmbed('This command can only be used in mod ticket threads!'),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  try {
    if (!threadAlerts.has(thread.id)) {
      threadAlerts.set(thread.id, new Set())
    }

    const alerts = threadAlerts.get(thread.id)!

    alerts.add(interaction.user.id)
    await interaction.reply({
      embeds: [
        successEmbed(
          'Alert set',
          'You will receive a DM when the ticket creator sends their next message in this thread. The alert will be removed after you are notified.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
    })
  } catch (error) {
    console.error('Error setting alert:', error)
    await interaction.reply({
      embeds: [errorEmbed('Failed to set alert. Please try again.')],
      flags: MessageFlags.Ephemeral,
    })
  }
}
