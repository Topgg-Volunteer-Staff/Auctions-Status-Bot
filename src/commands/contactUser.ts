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
  GuildMember,
} from 'discord.js'
import { guildIds, roleIds } from '../globals'
import { PRE_MODAL_BUDGET_MS, settleBy } from '../utils/interactionGuard'

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

  // The modal has to be the first response, so every lookup below shares a
  // time budget to make sure it opens before the interaction expires.
  const deadline = Date.now() + PRE_MODAL_BUDGET_MS

  // Staff roles only exist in the main guild, so permissions are checked there
  // no matter which guild the command was run in.
  const fetchedGuild = client.guilds.cache.has(guildIds.main)
    ? null
    : await settleBy(client.guilds.fetch(guildIds.main), deadline)
  const mainGuild =
    client.guilds.cache.get(guildIds.main) ??
    (fetchedGuild === 'timedOut' ? null : fetchedGuild)

  if (!mainGuild) {
    await interaction.reply({
      content: 'Could not reach the main server to verify your permissions.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const hasReviewerRole = (member: GuildMember | null | undefined) =>
    !!member &&
    (member.roles.cache.has(roleIds.reviewer) ||
      member.roles.cache.has(roleIds.trialReviewer))

  // Only go to Discord for fresh roles when the cache doesn't already
  // grant access.
  if (!hasReviewerRole(mainGuild.members.cache.get(interaction.user.id))) {
    const freshMember = await settleBy(
      mainGuild.members.fetch({ user: interaction.user.id, force: true }),
      deadline
    )

    if (freshMember === 'timedOut') {
      await interaction.reply({
        content:
          'Discord took too long to confirm your permissions. Please try again.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    if (!hasReviewerRole(freshMember)) {
      await interaction.reply({
        content: 'You do not have permission for this!',
        flags: MessageFlags.Ephemeral,
      })
      return
    }
  }

  // fetch target user
  const user = interaction.options.getUser('user', true)

  // ensure target user is in the main server, where the ticket is created.
  // If Discord is slow, open the modal anyway; the submit checks again.
  const member =
    mainGuild.members.cache.get(user.id) ??
    (await settleBy(mainGuild.members.fetch(user.id), deadline))
  if (!member) {
    await interaction.reply({
      content: `User **${user.username}** (\`${user.id}\`) is not in **${mainGuild.name}**.`,
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
