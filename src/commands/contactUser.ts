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
import { guildIds, roleIds } from '../globals'

export const command = new SlashCommandBuilder()
  .setName('contactuser')
  .setDescription('Contact a specific user')
  .setContexts(InteractionContextType.Guild)
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('The user to contact')
      .setRequired(true)
  )

// Registered globally so staff can run it from other guilds too.
export const global = true

export const execute = async (
  client: Client,
  interaction: ChatInputCommandInteraction
) => {
  if (!interaction.inGuild()) return

  // Staff roles only exist in the main guild, so permissions are checked there
  // no matter which guild the command was run in.
  const mainGuild =
    client.guilds.cache.get(guildIds.main) ??
    (await client.guilds.fetch(guildIds.main).catch(() => null))

  if (!mainGuild) {
    await interaction.reply({
      content: 'Could not reach the main server to verify your permissions.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const cachedMember = mainGuild.members.cache.get(interaction.user.id)
  const freshMember = await mainGuild.members
    .fetch({ user: interaction.user.id, force: true })
    .catch(() => null)

  const roleIdsOnMember = new Set<string>([
    ...(cachedMember ? cachedMember.roles.cache.keys() : []),
    ...(freshMember ? freshMember.roles.cache.keys() : []),
  ])

  // check for reviewer or trial reviewer role by ID from both cached and fresh member data
  const hasReviewerAccess =
    roleIdsOnMember.has(roleIds.reviewer) ||
    roleIdsOnMember.has(roleIds.trialReviewer)

  if (!hasReviewerAccess) {
    await interaction.reply({
      content: 'You do not have permission for this!',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // fetch target user
  const user = interaction.options.getUser('user', true)

  // ensure target user is in the main server, where the ticket is created
  try {
    const member = await mainGuild.members.fetch(user.id).catch(() => null)
    if (!member) {
      await interaction.reply({
        content: `User **${user.username}** (\`${user.id}\`) is not in **${mainGuild.name}**.`,
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

  modal.addLabelComponents(botIdLabel, reasonLabel, fileUploadLabel)
  await interaction.showModal(modal)
}
