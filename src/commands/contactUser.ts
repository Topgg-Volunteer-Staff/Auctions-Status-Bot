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
  UserSelectMenuBuilder,
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

  const botId = new TextInputBuilder()
    .setCustomId('botId')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100)
    .setPlaceholder('E.g. 422087909634736160')

  // User select to choose the user to contact
  const userSelectLabel = new LabelBuilder()
    .setLabel('User to contact')
    .setUserSelectMenuComponent(
      new UserSelectMenuBuilder()
        .setCustomId('contactUserSelect')
        .setMinValues(1)
        .setMaxValues(1)
    )

  // Bot ID input
  const botIdLabel = new LabelBuilder()
    .setLabel('Bot ID')
    .setTextInputComponent(botId)

  // Reason input
  const reasonLabel = new LabelBuilder()
    .setLabel('Reason')
    .setTextInputComponent(reason)

  modal.addLabelComponents(userSelectLabel, botIdLabel, reasonLabel)
  await interaction.showModal(modal)
}
