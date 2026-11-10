import {
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  UserSelectMenuBuilder,
} from 'discord.js'

import { emoji } from './emojis'

// Where trial reviewer onboarding / offboarding notices are posted.
export const TRIAL_REVIEWER_CHANNEL_ID = '1469804108020977800'

// Roles allowed to manage trial reviewer → mentor links (/trial and the
// mentor picker posted when someone gets the trial role).
export const TRIAL_MENTOR_MANAGER_ROLE_IDS = [
  '774710870185869342',
  '742408262648987748',
] as const

// customId is `${prefix}_${trialReviewerId}`; the router matches on the part
// before the first underscore.
export const TRIAL_MENTOR_SELECT_PREFIX = 'trialmentor'

export const buildTrialMentorSelectId = (trialReviewerId: string): string =>
  `${TRIAL_MENTOR_SELECT_PREFIX}_${trialReviewerId}`

export const parseTrialMentorSelectId = (customId: string): string | null => {
  const [prefix, trialReviewerId] = customId.split('_')
  if (prefix !== TRIAL_MENTOR_SELECT_PREFIX) return null
  return trialReviewerId && /^\d{10,30}$/.test(trialReviewerId)
    ? trialReviewerId
    : null
}

const ACCENT_PENDING = 0x00bbff
const ACCENT_DONE = 0x00cc88
const ACCENT_STALE = 0xffaa00
const ACCENT_REMOVED = 0xff3366

const welcomeText = (trialReviewerId: string): string =>
  `Hey, I noticed <@${trialReviewerId}> got trial! Let's go ahead and get their mentor linked, so when a dispute ticket comes you are both added to that ticket.`

export const buildTrialMentorPromptPanel = (
  trialReviewerId: string
): ContainerBuilder => {
  const select = new UserSelectMenuBuilder()
    .setCustomId(buildTrialMentorSelectId(trialReviewerId))
    .setPlaceholder('Search for their mentor...')
    .setMinValues(1)
    .setMaxValues(1)

  return new ContainerBuilder()
    .setAccentColor(ACCENT_PENDING)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emoji.br} Let's get their mentor linked`
      ),
      new TextDisplayBuilder().setContent(welcomeText(trialReviewerId))
    )
    .addActionRowComponents(
      new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select)
    )
}

export const buildTrialMentorLinkedPanel = (options: {
  trialReviewerId: string
  mentorId: string
  linkedById: string
  previousMentorId: string | null
}): ContainerBuilder => {
  const replaced =
    options.previousMentorId && options.previousMentorId !== options.mentorId
      ? ` (replaced <@${options.previousMentorId}>)`
      : ''

  return new ContainerBuilder()
    .setAccentColor(ACCENT_DONE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${emoji.online} Mentor linked`),
      new TextDisplayBuilder().setContent(
        `${welcomeText(options.trialReviewerId)}\n\n**Trial:** <@${
          options.trialReviewerId
        }>\n**Mentor:** <@${options.mentorId}>${replaced}`
      ),
      new TextDisplayBuilder().setContent(
        `-# Linked by <@${options.linkedById}> · change it any time with /trial add`
      )
    )
}

export const buildTrialMentorUnlinkedPanel = (
  trialReviewerId: string,
  previousMentorId: string | null
): ContainerBuilder =>
  new ContainerBuilder()
    .setAccentColor(ACCENT_REMOVED)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emoji.delete} Mentor link removed`
      ),
      new TextDisplayBuilder().setContent(
        `Hey, I noticed <@${trialReviewerId}> no longer has the Trial Reviewer role, so I automatically removed their mentor link.\n\n**Trial:** <@${trialReviewerId}>\n**Mentor:** ${
          previousMentorId ? `<@${previousMentorId}>` : 'Unknown'
        }`
      )
    )

export const buildTrialMentorStalePanel = (
  trialReviewerId: string
): ContainerBuilder =>
  new ContainerBuilder()
    .setAccentColor(ACCENT_STALE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emoji.warning} No longer a trial reviewer`
      ),
      new TextDisplayBuilder().setContent(
        `<@${trialReviewerId}> doesn't have the Trial Reviewer role anymore, so no mentor was linked.`
      )
    )
