import { ButtonInteraction, Client, MessageFlags } from 'discord.js'

import {
  buildAuditPaginationComponents,
  getAuditPageEmbed,
  getUserAuditEmbeds,
  auditPageButtonName,
} from '../commands/auditResolved'
import { errorEmbed } from '../utils/embeds'

export const button = {
  name: auditPageButtonName,
}

const parsePageIndex = (rawPage: string | undefined): number => {
  if (!rawPage) return 0

  const parsed = Number(rawPage)
  if (!Number.isInteger(parsed) || parsed <= 0) return 0

  return parsed - 1
}

export const execute = async (
  client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return

  const [, userId, startInput, endInput, rawPage] = interaction.customId.split('_')

  if (!userId || !startInput || !endInput) {
    await interaction.reply({
      embeds: [errorEmbed('Audit failed', 'Invalid pagination state.')],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferUpdate()

  try {
    const targetUser =
      interaction.client.users.cache.get(userId) ??
      (await client.users.fetch(userId).catch(() => null))

    if (!targetUser) {
      await interaction.followUp({
        embeds: [errorEmbed('Audit failed', 'Unable to load that user.')],
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const embeds = await getUserAuditEmbeds(
      interaction,
      targetUser,
      startInput,
      endInput
    )
    const pageIndex = parsePageIndex(rawPage)
    const safePageIndex = Math.max(0, Math.min(pageIndex, embeds.length - 1))
    const currentEmbed = getAuditPageEmbed(embeds, safePageIndex)

    await interaction.editReply({
      embeds: [currentEmbed],
      components: buildAuditPaginationComponents(
        targetUser.id,
        startInput,
        endInput,
        safePageIndex,
        embeds.length
      ),
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to change audit page.'

    await interaction.followUp({
      embeds: [errorEmbed('Audit failed', message)],
      flags: MessageFlags.Ephemeral,
    })
  }
}