import {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Client,
  ChatInputCommandInteraction,
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
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('The user to contact')
      .setRequired(true)
  )

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
) => {
  if (!interaction.inCachedGuild()) return

  // check for reviewer role
  const hasReviewerRole = interaction.member.roles.cache.has(roleIds.reviewer)
  if (!hasReviewerRole) {
    await interaction.reply({
      content: 'You do not have permission for this!',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // fetch target user
  const user = interaction.options.getUser('user', true)

  // ensure target user is in the server
  try {
    const member = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null)
    if (!member) {
      await interaction.reply({
        content: `User **${user.username}** (\`${user.id}\`) is not in the server.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }
  } catch (error) {
    await interaction.reply({
      content: 'Failed to validate user. Please try again.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const modal = new ModalBuilder()
    // user id passed through customId
    .setCustomId(`contactUserModal_${user.id}`)
    .setTitle(`Contact ${user.username}`)

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

  const fileUpload = new FileUploadBuilder()
    .setCustomId('fileUpload')
    .setMinValues(0)
    .setMaxValues(5)
    .setRequired(false)

  // regular string input, no validation
  const botIdLabel = new LabelBuilder()
    .setLabel('Bot ID')
    .setTextInputComponent(botId)

  const reasonLabel = new LabelBuilder()
    .setLabel('Reason')
    .setTextInputComponent(reason)

  const fileUploadLabel = new LabelBuilder()
    .setLabel('Attachments')
    .setFileUploadComponent(fileUpload)

  modal.addLabelComponents(
    botIdLabel,
    reasonLabel,
    fileUploadLabel
  )
  await interaction.showModal(modal)
}
