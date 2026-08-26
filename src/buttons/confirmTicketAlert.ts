import { ButtonInteraction, Client } from 'discord.js'

import { buildReportModal } from '../menus/report'
import { buildOtherModal } from '../menus/other'
import { buildTransferOwnershipModal } from '../menus/transfer_ownership'

const CUSTOM_ID_PREFIX = 'confirmTicketAlert_'

export const button = {
  name: 'confirmTicketAlert',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const ticketType = interaction.customId.slice(CUSTOM_ID_PREFIX.length)

  switch (ticketType) {
    case 'report':
      await interaction.showModal(buildReportModal())
      break
    case 'other':
      await interaction.showModal(buildOtherModal())
      break
    case 'transfer_ownership':
      await interaction.showModal(buildTransferOwnershipModal())
      break
  }
}
