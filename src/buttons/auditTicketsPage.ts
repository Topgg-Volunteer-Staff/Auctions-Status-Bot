import { ButtonInteraction, Client } from 'discord.js'
import {
  type AuditTicketFilters,
  auditTicketsPageButtonName,
  buildAuditTicketsPaginationComponents,
  buildAuditTicketsPanel,
  getOpenTicketAuditEntries,
  isAuditTicketCategoryFilter,
  paginateAuditTicketEntries,
} from '../commands/audit-tickets'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
} from '../utils/componentsV2'

export const button = {
  name: auditTicketsPageButtonName,
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return

  const [, requestingUserId, rawCategory, rawStaffUserId, rawPage] =
    interaction.customId.split('_')
  if (!requestingUserId || requestingUserId !== interaction.user.id) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'Not your audit',
          'Only the moderator who ran this audit can change its page.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      allowedMentions: { parse: [] },
    })
    return
  }

  if (
    !rawCategory ||
    !isAuditTicketCategoryFilter(rawCategory) ||
    !rawStaffUserId ||
    (rawStaffUserId !== 'all' && !/^\d+$/.test(rawStaffUserId))
  ) {
    await interaction.reply({
      components: [
        createErrorPanel('Ticket audit failed', 'Invalid filter state.'),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      allowedMentions: { parse: [] },
    })
    return
  }

  const filters: AuditTicketFilters = {
    category: rawCategory,
    staffUserId: rawStaffUserId === 'all' ? null : rawStaffUserId,
  }

  await interaction.deferUpdate()

  try {
    const requestedPage = Number(rawPage) - 1
    const entries = await getOpenTicketAuditEntries(
      interaction.guild,
      undefined,
      filters
    )
    const pages = paginateAuditTicketEntries(entries)
    const pageIndex = Number.isInteger(requestedPage)
      ? Math.max(0, Math.min(requestedPage, pages.length - 1))
      : 0
    const panel = buildAuditTicketsPanel(
      pages[pageIndex] ?? [],
      interaction.guildId,
      entries.length,
      pageIndex,
      pages.length,
      filters
    )
    const pagination = buildAuditTicketsPaginationComponents(
      interaction.user.id,
      pageIndex,
      pages.length,
      filters
    )
    if (pagination.length > 0) panel.addActionRowComponents(...pagination)

    await interaction.editReply({
      components: [panel],
      flags: COMPONENTS_V2_FLAGS,
      allowedMentions: { parse: [] },
    })
  } catch (error) {
    console.error('Failed to change ticket audit page:', error)
    await interaction.followUp({
      components: [
        createErrorPanel(
          'Ticket audit failed',
          'I could not refresh the open tickets.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      allowedMentions: { parse: [] },
    })
  }
}
