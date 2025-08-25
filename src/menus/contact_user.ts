import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuInteraction,
  Client,
} from 'discord.js'
import { roleIds } from '../globals'

export const menu = {
  name: 'contact_user',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  // Check if user has reviewer role
  const hasReviewerRole = interaction.member.roles.cache.has(roleIds.reviewer)
  if (!hasReviewerRole) {
    await interaction.reply({
      content: 'You do not have permission for this!',
      ephemeral: true,
    })
    return
  }

  const modal = new ModalBuilder()
    .setCustomId('contactUserModal')
    .setTitle('Contact user')

  const userId = new TextInputBuilder()
    .setCustomId('userId')
    .setLabel('User ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20)
    .setPlaceholder('E.g. 264811613708746752')

  const reason = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. Need to discuss bot issues, account issues, etc.')

  const userIdRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    userId
  )
  const reasonRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reason
  )

  modal.addComponents(userIdRow, reasonRow)
  await interaction.showModal(modal)
}
