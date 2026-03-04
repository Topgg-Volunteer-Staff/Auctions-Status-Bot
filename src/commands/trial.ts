import {
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
  MessageFlags,
} from 'discord.js'

import {
  listTrialReviewerMentors,
  removeTrialReviewerMentor,
  setMentorForTrialReviewer,
} from '../utils/trialReviewerMentors'

import { errorEmbed, infoEmbed, successEmbed } from '../utils/embeds'

export const command = new SlashCommandBuilder()
  .setName('trial')
  .setDescription('Trial reviewer mentor links')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Link a trial reviewer to their mentor (for dispute pings)')
      .addUserOption((option) =>
        option
          .setName('trial')
          .setDescription('The trial reviewer')
          .setRequired(true)
      )
      .addUserOption((option) =>
        option.setName('mentor').setDescription('The mentor').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('list').setDescription('List trial reviewer → mentor links')
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove a trial reviewer → mentor link')
      .addUserOption((option) =>
        option
          .setName('trial')
          .setDescription('The trial reviewer')
          .setRequired(true)
      )
  )

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      embeds: [
        errorEmbed('Server only', 'This command can only be used in a server.'),
      ],
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
      embeds: [
        errorEmbed(
          'No permission',
          'You do not have permission to use this command.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const sub = interaction.options.getSubcommand()

  if (sub === 'add') {
    const trialUser = interaction.options.getUser('trial', true)
    const mentorUser = interaction.options.getUser('mentor', true)

    if (trialUser.id === mentorUser.id) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            'Invalid users',
            'Trial reviewer and mentor cannot be the same user.'
          ),
        ],
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
        embeds: [
          successEmbed(
            'Mentor linked',
            `<@${trialUser.id}> → <@${mentorUser.id}>${suffix}`
          ),
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { users: [] },
      })
    } catch (err) {
      console.error('Failed to set trial reviewer mentor:', err)
      await interaction.reply({
        embeds: [errorEmbed('Save failed', 'Please try again.')],
        flags: MessageFlags.Ephemeral,
      })
    }

    return
  }

  if (sub === 'remove') {
    const trialUser = interaction.options.getUser('trial', true)

    try {
      const res = await removeTrialReviewerMentor(trialUser.id)

      if (!res.removed) {
        await interaction.reply({
          embeds: [
            infoEmbed(`No mentor link found for <@${trialUser.id}>.`),
          ],
          flags: MessageFlags.Ephemeral,
          allowedMentions: { users: [] },
        })
        return
      }

      await interaction.reply({
        embeds: [
          successEmbed(
            'Mentor link removed',
            `Removed for <@${trialUser.id}>${
              res.previousMentorId ? ` (was <@${res.previousMentorId}>)` : ''
            }.`
          ),
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { users: [] },
      })
    } catch (err) {
      console.error('Failed to remove trial reviewer mentor:', err)
      await interaction.reply({
        embeds: [errorEmbed('Save failed', 'Please try again.')],
        flags: MessageFlags.Ephemeral,
      })
    }

    return
  }

  if (sub === 'list') {
    try {
      const pairs = await listTrialReviewerMentors()

      if (pairs.length === 0) {
        await interaction.reply({
          embeds: [infoEmbed('No trial reviewer mentor links configured.')],
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

      const embed = infoEmbed('')
        .setTitle('Trial reviewer mentor links')
        .setDescription(lines.join('\n'))

      await interaction.reply({
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { users: [] },
      })
    } catch (err) {
      console.error('Failed to list trial reviewer mentors:', err)
      await interaction.reply({
        embeds: [errorEmbed('Load failed', 'Please try again.')],
        flags: MessageFlags.Ephemeral,
      })
    }

    return
  }

  await interaction.reply({
    embeds: [
      errorEmbed(
        'Unknown subcommand',
        'Please choose one of: add, list, remove.'
      ),
    ],
    flags: MessageFlags.Ephemeral,
  })
}
