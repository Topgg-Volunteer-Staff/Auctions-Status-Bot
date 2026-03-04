import {
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionsBitField,
} from 'discord.js'

import { setMentorForTrialReviewer } from '../utils/trialReviewerMentors'

export const command = new SlashCommandBuilder()
  .setName('add-trial')
  .setDescription('Link a trial reviewer to their mentor (for dispute pings)')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
  .addUserOption((option) =>
    option
      .setName('trial')
      .setDescription('The trial reviewer')
      .setRequired(true)
  )
  .addUserOption((option) =>
    option.setName('mentor').setDescription('The mentor').setRequired(true)
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

  if (
    !interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)
  ) {
    await interaction.reply({
      content: '❌ You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const trialUser = interaction.options.getUser('trial', true)
  const mentorUser = interaction.options.getUser('mentor', true)

  if (trialUser.id === mentorUser.id) {
    await interaction.reply({
      content: '❌ Trial reviewer and mentor cannot be the same user.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  try {
    const res = await setMentorForTrialReviewer(trialUser.id, mentorUser.id)

    const suffix = res.created
      ? ''
      : res.previousMentorId
        ? ` (was <@${res.previousMentorId}>)`
        : ''

    await interaction.reply({
      content: `✅ Linked <@${trialUser.id}> → <@${mentorUser.id}>${suffix}.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { users: [] },
    })
  } catch (err) {
    console.error('Failed to set trial reviewer mentor:', err)
    await interaction.reply({
      content: '❌ Failed to save. Please try again.',
      flags: MessageFlags.Ephemeral,
    })
  }
}
