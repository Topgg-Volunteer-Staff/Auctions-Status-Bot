import { ButtonInteraction, Client } from 'discord.js'

import {
  buildAuditPaginationComponents,
  getAuditPagePanel,
  getUserAuditPanels,
  auditPageButtonName,
} from '../commands/auditResolved'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
} from '../utils/componentsV2'

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

  const [, userId, startInput, endInput, rawPage] =
    interaction.customId.split('_')

  if (!userId || !startInput || !endInput) {
    await interaction.reply({
      components: [
        createErrorPanel('Audit failed', 'Invalid pagination state.'),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      allowedMentions: { parse: [] },
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
        components: [
          createErrorPanel('Audit failed', 'Unable to load that user.'),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
        allowedMentions: { parse: [] },
      })
      return
    }

    const panels = await getUserAuditPanels(
      interaction,
      targetUser,
      startInput,
      endInput
    )
    const pageIndex = parsePageIndex(rawPage)
    const safePageIndex = Math.max(0, Math.min(pageIndex, panels.length - 1))
    const currentPanel = getAuditPagePanel(panels, safePageIndex)
    const paginationComponents = buildAuditPaginationComponents(
      targetUser.id,
      startInput,
      endInput,
      safePageIndex,
      panels.length
    )

    if (paginationComponents.length > 0) {
      currentPanel.addActionRowComponents(...paginationComponents)
    }

    await interaction.editReply({
      components: [currentPanel],
      flags: COMPONENTS_V2_FLAGS,
      allowedMentions: { parse: [] },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to change audit page.'

    await interaction.followUp({
      components: [createErrorPanel('Audit failed', message)],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      allowedMentions: { parse: [] },
    })
  }
}
