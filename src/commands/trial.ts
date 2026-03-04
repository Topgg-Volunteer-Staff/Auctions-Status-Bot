import {
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
} from 'discord.js'

import { listTrialReviewerMentors } from '../utils/trialReviewerMentors'

export const command = new SlashCommandBuilder()
  .setName('trial')
  .setDescription('Trial reviewer mentor links')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('List trial reviewer → mentor links')
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

  const sub = interaction.options.getSubcommand()
  if (sub !== 'list') {
    await interaction.reply({
      content: 'Unknown subcommand.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  try {
    const pairs = await listTrialReviewerMentors()

    if (pairs.length === 0) {
      await interaction.reply({
        content: 'No trial reviewer mentor links configured.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const maxLines = 50
    const shown = pairs.slice(0, maxLines)

    const lines = shown.map(
      ({ reviewerId, mentorId }) => `<@${reviewerId}> → <@${mentorId}>`
    )

    if (pairs.length > shown.length) {
      lines.push(`...and ${pairs.length - shown.length} more`)
    }

    await interaction.reply({
      content: lines.join('\n'),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { users: [] },
    })
  } catch (err) {
    console.error('Failed to list trial reviewer mentors:', err)
    await interaction.reply({
      content: '❌ Failed to load list. Please try again.',
      flags: MessageFlags.Ephemeral,
    })
  }
}
