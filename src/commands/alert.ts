import {
  ChannelType,
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
  ThreadChannel,
  MessageFlags,
} from 'discord.js'
import { errorEmbed, successEmbed } from '../utils/embeds'
import { channelIds } from '../globals'

// Structure: threadId -> Map<modUserId, Set<userIdToAlert>>
export const threadAlerts = new Map<string, Map<string, Set<string>>>()

export const command = new SlashCommandBuilder()
  .setName('alert')
  .setDescription(
    'Get notified when a specific user sends a message in this thread'
  )
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('The user to alert on when they send a message')
      .setRequired(true)
  )
  .setContexts(InteractionContextType.Guild)

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
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
    const targetUser = interaction.options.getUser('user', true)

    let threadAlertMap = threadAlerts.get(thread.id)
    if (!threadAlertMap) {
      threadAlertMap = new Map<string, Set<string>>()
      threadAlerts.set(thread.id, threadAlertMap)
    }

    if (!threadAlertMap.has(interaction.user.id)) {
      threadAlertMap.set(interaction.user.id, new Set())
    }

    const userAlerts = threadAlertMap.get(interaction.user.id)
    if (!userAlerts) {
      // Should be impossible due to set above, but keep it safe.
      const created = new Set<string>()
      threadAlertMap.set(interaction.user.id, created)
      created.add(targetUser.id)
    } else {
      userAlerts.add(targetUser.id)
    }

    await interaction.reply({
      embeds: [
        successEmbed(
          'Alert set',
          `You will receive a DM when **${targetUser.username}** sends a message in this thread. The alert will be removed after you are notified.`
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
