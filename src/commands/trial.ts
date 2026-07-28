import {
  Client,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
  TextDisplayBuilder,
} from 'discord.js'

import {
  listTrialReviewerMentors,
  removeTrialReviewerMentor,
  setMentorForTrialReviewer,
} from '../utils/trialReviewerMentors'

import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  createTextPanel,
} from '../utils/componentsV2'
import { emoji } from '../utils/emojis'

const errorPanel = (title: string, description: string) =>
  createTextPanel({
    accentColor: 0xff3366,
    title: `${emoji.error} ${title}`,
    description,
  })

const infoPanel = (message: string) =>
  createTextPanel({
    accentColor: 0x00bbff,
    description: `${emoji.blueinfo} ${message}`,
  })

const successPanel = (title: string, description: string) =>
  createTextPanel({
    accentColor: 0x00cc88,
    title: `${emoji.online} ${title}`,
    description,
  })

export const command = new SlashCommandBuilder()
  .setName('trial')
  .setDescription('Trial reviewer mentor links')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription(
        'Link a trial reviewer to their mentor (for dispute pings)'
      )
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
      components: [
        errorPanel('Server only', 'This command can only be used in a server.'),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const allowedRoleIds = ['774710870185869342', '742408262648987748'] as const
  const member = interaction.member
  const hasAllowedRole = allowedRoleIds.some((id) => member.roles.cache.has(id))

  if (!hasAllowedRole) {
    await interaction.reply({
      components: [
        errorPanel(
          'No permission',
          'You do not have permission to use this command.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const sub = interaction.options.getSubcommand()

  if (sub === 'add') {
    const trialUser = interaction.options.getUser('trial', true)
    const mentorUser = interaction.options.getUser('mentor', true)

    if (trialUser.id === mentorUser.id) {
      await interaction.reply({
        components: [
          errorPanel(
            'Invalid users',
            'Trial reviewer and mentor cannot be the same user.'
          ),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
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
        components: [
          successPanel(
            'Mentor linked',
            `<@${trialUser.id}> → <@${mentorUser.id}>${suffix}`
          ),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
        allowedMentions: { users: [] },
      })
    } catch (err) {
      console.error('Failed to set trial reviewer mentor:', err)
      await interaction.reply({
        components: [errorPanel('Save failed', 'Please try again.')],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
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
          components: [
            infoPanel(`No mentor link found for <@${trialUser.id}>.`),
          ],
          flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
          allowedMentions: { users: [] },
        })
        return
      }

      await interaction.reply({
        components: [
          successPanel(
            'Mentor link removed',
            `Removed for <@${trialUser.id}>${
              res.previousMentorId ? ` (was <@${res.previousMentorId}>)` : ''
            }.`
          ),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
        allowedMentions: { users: [] },
      })
    } catch (err) {
      console.error('Failed to remove trial reviewer mentor:', err)
      await interaction.reply({
        components: [errorPanel('Save failed', 'Please try again.')],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
    }

    return
  }

  if (sub === 'list') {
    try {
      const pairs = await listTrialReviewerMentors()

      if (pairs.length === 0) {
        await interaction.reply({
          components: [infoPanel('No trial reviewer mentor links configured.')],
          flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
        })
        return
      }

      const maxLines = 50
      const shown = pairs.slice(0, maxLines)

      const entries = shown.map(
        ({ reviewerId, mentorId }) =>
          `**Trial:** <@${reviewerId}>\n**Mentor:** <@${mentorId}>`
      )

      const description =
        entries.join('\n\n') +
        (pairs.length > shown.length
          ? `\n\n...and ${pairs.length - shown.length} more`
          : '')

      const panel = createTextPanel({
        accentColor: 0x00bbff,
        title: 'Trial reviewer mentor links',
        description,
      }).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${pairs.length} link(s)`)
      )

      await interaction.reply({
        components: [panel],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
        allowedMentions: { users: [] },
      })
    } catch (err) {
      console.error('Failed to list trial reviewer mentors:', err)
      await interaction.reply({
        components: [errorPanel('Load failed', 'Please try again.')],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
    }

    return
  }

  await interaction.reply({
    components: [
      errorPanel(
        'Unknown subcommand',
        'Please choose one of: add, list, remove.'
      ),
    ],
    flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
  })
}
