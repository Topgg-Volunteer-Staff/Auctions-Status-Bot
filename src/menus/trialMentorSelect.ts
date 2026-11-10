import { Client, UserSelectMenuInteraction } from 'discord.js'

import { roleIds } from '../globals'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
} from '../utils/componentsV2'
import { setMentorForTrialReviewer } from '../utils/trialReviewerMentors'
import {
  TRIAL_MENTOR_MANAGER_ROLE_IDS,
  TRIAL_MENTOR_SELECT_PREFIX,
  buildTrialMentorLinkedPanel,
  buildTrialMentorStalePanel,
  parseTrialMentorSelectId,
} from '../utils/trialReviewerOnboarding'

export const userMenu = { name: TRIAL_MENTOR_SELECT_PREFIX }

const replyError = async (
  interaction: UserSelectMenuInteraction,
  title: string,
  description: string
): Promise<void> => {
  await interaction.reply({
    components: [createErrorPanel(title, description)],
    flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    allowedMentions: { parse: [] },
  })
}

export const execute = async (
  _client: Client,
  interaction: UserSelectMenuInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) {
    await replyError(
      interaction,
      'Server only',
      'This can only be used in a server.'
    )
    return
  }

  const hasAllowedRole = TRIAL_MENTOR_MANAGER_ROLE_IDS.some((id) =>
    interaction.member.roles.cache.has(id)
  )
  if (!hasAllowedRole) {
    await replyError(
      interaction,
      'No permission',
      'You do not have permission to link trial reviewer mentors.'
    )
    return
  }

  const trialReviewerId = parseTrialMentorSelectId(interaction.customId)
  const mentor = interaction.users.first()

  if (!trialReviewerId || !mentor) {
    await replyError(interaction, 'Invalid selection', 'Please try again.')
    return
  }

  if (mentor.id === trialReviewerId) {
    await replyError(
      interaction,
      'Invalid mentor',
      'Trial reviewer and mentor cannot be the same user.'
    )
    return
  }

  if (mentor.bot) {
    await replyError(interaction, 'Invalid mentor', 'A bot cannot be a mentor.')
    return
  }

  // The prompt can sit around for a while; don't link someone who has since
  // lost the trial role (the removal handler would never clean it up).
  const trialMember = await interaction.guild.members
    .fetch(trialReviewerId)
    .catch(() => null)

  if (!trialMember?.roles.cache.has(roleIds.trialReviewer)) {
    await interaction.update({
      components: [buildTrialMentorStalePanel(trialReviewerId)],
      flags: COMPONENTS_V2_FLAGS,
      allowedMentions: { parse: [] },
    })
    return
  }

  try {
    const { previousMentorId } = await setMentorForTrialReviewer(
      trialReviewerId,
      mentor.id
    )

    await interaction.update({
      components: [
        buildTrialMentorLinkedPanel({
          trialReviewerId,
          mentorId: mentor.id,
          linkedById: interaction.user.id,
          previousMentorId,
        }),
      ],
      flags: COMPONENTS_V2_FLAGS,
      allowedMentions: { parse: [] },
    })
  } catch (error) {
    console.error('Failed to link trial reviewer mentor from picker:', error)
    await replyError(interaction, 'Save failed', 'Please try again.')
  }
}
