import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Client,
  CommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
  MessageFlags,
} from 'discord.js'
import { roleIds } from '../globals'

export const command = new SlashCommandBuilder()
  .setName('contactuser')
  .setDescription('Contact a specific user')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions('0')

export const execute = async (
  _client: Client,
  interaction: CommandInteraction
) => {
  if (!interaction.inCachedGuild()) return

  // Check if user has reviewer role
  const hasReviewerRole = interaction.member.roles.cache.has(roleIds.reviewer)
  if (!hasReviewerRole) {
    await interaction.reply({
      content: 'You do not have permission for this!',
      flags: MessageFlags.Ephemeral,
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
