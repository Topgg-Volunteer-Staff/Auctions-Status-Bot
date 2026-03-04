import {
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
} from 'discord.js'

import { removeTrialReviewerMentor } from '../utils/trialReviewerMentors'

export const command = new SlashCommandBuilder()
  .setName('remove-trial')
  .setDescription('Remove a trial reviewer → mentor link')
  .setContexts(InteractionContextType.Guild)
  .addUserOption((option) =>
    option
      .setName('trial')
      .setDescription('The trial reviewer')
      .setRequired(true)
  )

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const allowedRoleIds = ['774710870185869342', '742408262648987748'] as const
  const member = interaction.member
  const hasAllowedRole = allowedRoleIds.some((id) =>
    member.roles.cache.has(id)
  )

  if (!hasAllowedRole) {
    await interaction.reply({
      content: '❌ You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const trialUser = interaction.options.getUser('trial', true)

  try {
    const res = await removeTrialReviewerMentor(trialUser.id)

    if (!res.removed) {
      await interaction.reply({
        content: `ℹ️ No mentor link found for <@${trialUser.id}>.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: { users: [] },
      })
      return
    }

    await interaction.reply({
      content: `✅ Removed mentor link for <@${trialUser.id}>${
        res.previousMentorId ? ` (was <@${res.previousMentorId}>)` : ''
      }.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { users: [] },
    })
  } catch (err) {
    console.error('Failed to remove trial reviewer mentor:', err)
    await interaction.reply({
      content: '❌ Failed to save. Please try again.',
      flags: MessageFlags.Ephemeral,
    })
  }
}
