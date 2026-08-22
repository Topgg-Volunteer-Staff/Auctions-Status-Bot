import { ButtonInteraction, Client, MessageFlags } from 'discord.js'

import {
  buildVerificationCenterBotReminderMessage,
  getVerificationCenterBotRoleNames,
  kickVerificationCenterBotButtonName,
} from '../utils/verificationCenter/inactiveBotReminders'
import { VERIFICATION_CENTER_GUILD_ID } from '../utils/verificationCenter/botMembers'

type KickVerificationCenterBotRequest = {
  reviewerId: string
  botId: string
  joinedTimestamp: number
}

export const button = {
  name: kickVerificationCenterBotButtonName,
}

export function parseKickVerificationCenterBotCustomId(
  customId: string
): KickVerificationCenterBotRequest | null {
  const [buttonName, reviewerId, botId, rawJoinedTimestamp, ...extraParts] =
    customId.split('_')

  if (
    buttonName !== kickVerificationCenterBotButtonName ||
    !reviewerId ||
    !botId ||
    !rawJoinedTimestamp ||
    extraParts.length > 0 ||
    !/^\d+$/.test(reviewerId) ||
    !/^\d+$/.test(botId) ||
    !/^\d+$/.test(rawJoinedTimestamp)
  ) {
    return null
  }

  const joinedTimestamp = Number(rawJoinedTimestamp)
  if (!Number.isSafeInteger(joinedTimestamp) || joinedTimestamp <= 0) {
    return null
  }

  return { reviewerId, botId, joinedTimestamp }
}

export const execute = async (
  client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  const request = parseKickVerificationCenterBotCustomId(interaction.customId)
  if (!request) {
    await interaction.reply({
      content: 'This Kick Bot button is missing valid reminder information.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (interaction.user.id !== request.reviewerId) {
    await interaction.reply({
      content:
        'Only the reviewer mentioned in this reminder can kick this bot.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const verificationCenter =
    client.guilds.cache.get(VERIFICATION_CENTER_GUILD_ID) ??
    (await client.guilds.fetch(VERIFICATION_CENTER_GUILD_ID).catch(() => null))

  if (!verificationCenter) {
    await interaction.editReply(
      'I could not access the Verification Center to kick this bot.'
    )
    return
  }

  const botMember = await verificationCenter.members
    .fetch(request.botId)
    .catch(() => null)

  if (!botMember) {
    await interaction.editReply(
      'This bot is no longer in the Verification Center.'
    )
    return
  }

  if (!botMember.user.bot) {
    await interaction.editReply('This reminder target is no longer a bot.')
    return
  }

  if (botMember.joinedTimestamp !== request.joinedTimestamp) {
    await interaction.editReply(
      'This reminder is stale because the bot has rejoined the Verification Center.'
    )
    return
  }

  if (!botMember.kickable) {
    await interaction.editReply(
      'I do not have permission to kick this bot from the Verification Center.'
    )
    return
  }

  const roleNames = getVerificationCenterBotRoleNames(botMember)

  try {
    await botMember.kick(
      `Kicked from Verification Center by ${interaction.user.tag} via inactive bot reminder`
    )
  } catch (error) {
    console.error(
      `Failed to kick Verification Center bot ${request.botId} for reviewer ${request.reviewerId}:`,
      error
    )
    await interaction.editReply(
      'I could not kick this bot from the Verification Center. Please try again or contact William.'
    )
    return
  }

  const kickedReminder = buildVerificationCenterBotReminderMessage(
    request.reviewerId,
    {
      id: request.botId,
      joinedTimestamp: request.joinedTimestamp,
      roleNames,
    },
    { disabled: true, label: `Kicked by ${interaction.user.username}` }
  )
  const updatedComponents = kickedReminder.components
  if (updatedComponents) {
    await interaction.message
      .edit({ components: updatedComponents })
      .catch((error: unknown) => {
        console.error(
          `Failed to disable VC kick button for bot ${request.botId}:`,
          error
        )
      })
  }

  await interaction.editReply(
    `Kicked bot \`${request.botId}\` from the Verification Center.`
  )
}
