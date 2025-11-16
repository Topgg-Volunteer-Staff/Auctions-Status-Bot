import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Client,
  CommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
  MessageFlags,
  LabelBuilder,
  FileUploadBuilder,
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

  const reason = new TextInputBuilder()
    .setCustomId('reason')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. Need to discuss bot issues, account issues, etc.')

  const userId = new TextInputBuilder()
    .setCustomId('userId')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(20)
    .setPlaceholder('E.g. 422087909634736160')

  const botId = new TextInputBuilder()
    .setCustomId('botId')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100)
    .setPlaceholder('E.g. 422087909634736160')

  // File upload component
  const fileUpload = new FileUploadBuilder()
    .setCustomId('fileUpload')
    .setMinValues(0)
    .setMaxValues(5)
    .setRequired(false)

  // User ID input
  const userIdLabel = new LabelBuilder()
    .setLabel('User ID to contact')
    .setTextInputComponent(userId)

  // Bot ID input
  const botIdLabel = new LabelBuilder()
    .setLabel('Bot ID')
    .setTextInputComponent(botId)

  // Reason input
  const reasonLabel = new LabelBuilder()
    .setLabel('Reason')
    .setTextInputComponent(reason)

  // File upload component
  const fileUploadLabel = new LabelBuilder()
    .setLabel('Attachments')
    .setFileUploadComponent(fileUpload)

  modal.addLabelComponents(
    userIdLabel,
    botIdLabel,
    reasonLabel,
    fileUploadLabel
  )
  await interaction.showModal(modal)
}
