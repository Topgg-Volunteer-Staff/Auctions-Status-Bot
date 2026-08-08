import { ButtonInteraction, Client } from 'discord.js'
import {
  auditTicketsPageButtonName,
  buildAuditTicketsPaginationComponents,
  buildAuditTicketsPanel,
  getOpenTicketAuditEntries,
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

  const [, requestingUserId, rawPage] = interaction.customId.split('_')
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

  await interaction.deferUpdate()

  try {
    const requestedPage = Number(rawPage) - 1
    const entries = await getOpenTicketAuditEntries(interaction.guild)
    const pages = paginateAuditTicketEntries(entries)
    const pageIndex = Number.isInteger(requestedPage)
      ? Math.max(0, Math.min(requestedPage, pages.length - 1))
      : 0
    const panel = buildAuditTicketsPanel(
      pages[pageIndex] ?? [],
      interaction.guildId,
      entries.length,
      pageIndex,
      pages.length
    )
    const pagination = buildAuditTicketsPaginationComponents(
      interaction.user.id,
      pageIndex,
      pages.length
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
