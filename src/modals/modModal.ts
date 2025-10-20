import {
  ModalSubmitInteraction,
  Client,
  ChannelType,
  EmbedBuilder,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  MessageType,
} from 'discord.js'
import { emoji } from '../utils/emojis'
import { channelIds, roleIds } from '../globals'
import { errorEmbed, successEmbed } from '../utils/embeds'

export const modal = {
  name: 'modModal',
}

export const execute = async (
  _client: Client,
  interaction: ModalSubmitInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  // Extract type from modal's customId
  const match = interaction.customId.match(/^modModal_(.+)$/)
  if (!match) return
  let type = match[1]
  const originalType = type

  // Handle the new unified report modal (defensive: default to Other on any error)
  let reportSelectedLabel = ''
  if (type === 'report') {
    try {
      const values = interaction.fields.getStringSelectValues('reportType')
      const selected = values[0] || 'other'
      const reportTypeMap: Record<string, string> = {
        bot: 'report_bot',
        server: 'report_server',
        user: 'report_user',
        review: 'report_review',
        other: 'report_other',
      }
      const labelMap: Record<string, string> = {
        bot: 'Bot',
        server: 'Server',
        user: 'User',
        review: 'Review',
        other: 'Other',
      }
      reportSelectedLabel = labelMap[selected] || 'Other'
      type = reportTypeMap[selected] || 'report_other'
    } catch {
      reportSelectedLabel = 'Other'
      type = 'report_other'
    }
  }

  // Handle the general other modal
  if (type === 'other') {
    type = 'report_other'
  }

  const modTickets = interaction.client.channels.cache.get(
    channelIds.modTickets
  ) as TextChannel | undefined

  if (!modTickets) {
    await interaction.editReply({
      embeds: [errorEmbed('Error', 'Mod tickets channel not found .')],
    })
    return
  }

  const activeThreads = await modTickets.threads.fetchActive()
  const existingThread = activeThreads.threads.find(
    (t) => t.name === interaction.user.username
  )

  if (existingThread) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Can’t open a new ticket!',
          `You already have an open ticket here: <#${existingThread.id}>`
        ),
      ],
    })
    return
  }

  // Determine input field names based on modal type
  let modReasonField = 'modReason'
  let entityIDField = 'entityID'

  // Handle report modal fields
  if (type && type.startsWith('report_') && originalType !== 'other') {
    modReasonField = 'reason'
    entityIDField = 'entityID'
  } else if (type === 'modOwnershipUserID') {
    modReasonField = 'modOwnershipUserID'
    entityIDField = ''
  } else if (type === 'modOwnershipBotOrServer') {
    modReasonField = 'modOwnershipBotOrServer'
    entityIDField = ''
  }
  if (type === 'transfer_ownership') {
    // For ownership transfers: entity is the provided project ID from the modal
    modReasonField = ''
    entityIDField = 'projectID'
  }

  // Extract user inputs safely
  let userInput = ''
  try {
    userInput = interaction.fields.getTextInputValue(modReasonField)
  } catch {
    userInput = ''
  }

  let entityID = ''
  if (entityIDField) {
    try {
      entityID = interaction.fields.getTextInputValue(entityIDField)
    } catch {
      entityID = ''
    }
  }

  // Extract ownership type for transfer_ownership tickets
  let selectedOwnershipType = ''
  if (type === 'transfer_ownership') {
    try {
      const values = interaction.fields.getStringSelectValues('ownershipType')
      selectedOwnershipType = values[0] || ''
    } catch {
      selectedOwnershipType = ''
    }
  }

  // Extract category type for other modal
  let selectedCategoryType = ''
  if (type === 'other') {
    try {
      const values = interaction.fields.getStringSelectValues('categoryType')
      selectedCategoryType = values[0] || ''
    } catch {
      selectedCategoryType = ''
    }
  }

  // 🔹 Different cases for different tickets
  let titleExtra = ''
  let descriptionExtra = ''
  switch (type) {
    case 'report_other':
      titleExtra = 'Other Report'
      break
    case 'report_bot':
      titleExtra = 'Bot Report'
      break
    case 'report_review':
      titleExtra = 'Review Report'
      break
    case 'report_server':
      titleExtra = 'Server Report'
      break
    case 'report_user':
      titleExtra = 'User Report'
      break
    case 'other':
      // Handle the new other modal with category selection
      const categoryLabels: Record<string, string> = {
        account: 'Account Issue',
        ban_appeal: 'Ban Appeal',
        bug: 'Bug Report',
        project_listing: 'Project Listing Issue',
        unable_to_vote: 'Unable to Vote Issue',
        other: 'Other Issue',
      }
      titleExtra = categoryLabels[selectedCategoryType] || 'Other Issue'
      break
    case 'transfer_ownership':
      if (selectedOwnershipType === 'bot') {
        titleExtra = 'Bot Ownership Transfer Request'
        descriptionExtra = `${emoji.bot} To prove ownership, you must be able to do one of the following:\n- Change the bot's description on the Discord Developer Portal to "Top.gg Verification".\n- Send a Direct Message through the bot.\n- Edit a bot's command or add a new custom command saying "Top.gg Verification".\n\nIf you are unable to do any of these, unfortunately we cannot transfer ownership to you.`
      } else if (selectedOwnershipType === 'server') {
        titleExtra = 'Server Ownership Transfer Request'
        descriptionExtra = `${emoji.server} To prove ownership, please **send your server's invite link** (e.g. .gg/dbl). We will join the server to verify ownership.`
      }
      break
  }

  const embed = new EmbedBuilder()
    .setTitle(`${titleExtra}`)
    .setDescription(
      type === 'transfer_ownership'
        ? descriptionExtra
        : `${
            descriptionExtra ? descriptionExtra + '\n\n' : ''
          }Please provide any additional context or evidence if applicable.\n\n${
            emoji.dotred
          } A mod will respond as soon as possible. Please don't ping individual staff.`
    )
    .setColor('#ff3366')

  const thread = await modTickets.threads.create({
    name: interaction.user.username,
    type: ChannelType.PrivateThread,
    autoArchiveDuration: 10080,
  })

  await thread.send({
    content: `<@&${roleIds.modNotifications}>, <@${interaction.user.id}> has created a ticket.`,
    embeds: [embed],
  })

  const closeButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`closeModTicket_${interaction.user.id}`)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
  )

  const closeEmbed = new EmbedBuilder()
    .setColor('#ff3366')
    .setDescription(
      `${emoji.dotred} If this ticket was opened by mistake, you can close it below.`
    )

  await thread.send({
    embeds: [closeEmbed],
    components: [closeButton],
  })

  // Create webhook to mimic user message
  const webhook = await modTickets.createWebhook({
    name: interaction.user.username,
    avatar: interaction.user.displayAvatarURL(),
  })

  const idLabels: Record<string, string> = {
    report_server: 'Server ID',
    report_bot: 'Bot ID',
    report_user: 'User ID',
    report_review: 'Bot/Server ID',
    transfer_ownership: 'ID',
    report_other: '',
  }

  // Ownership type (only for transfer ownership modal)
  let ownershipType = ''
  if (type === 'transfer_ownership') {
    try {
      const typeValues =
        interaction.fields.getStringSelectValues('ownershipType')
      const raw = typeValues[0] || ''
      ownershipType = raw === 'bot' ? 'Bot' : raw === 'server' ? 'Server' : raw
    } catch {
      ownershipType = ''
    }
  }

  let screenshot = ''
  try {
    screenshot = interaction.fields.getTextInputValue('screenshot')
  } catch {
    screenshot = ''
  }

  // Ownership transferee (only for transfer ownership modal)
  let ownershipTransfer = ''
  if (type === 'transfer_ownership') {
    try {
      const selectedUsers = interaction.fields.getSelectedUsers(
        'ownershipUserSelect',
        true
      )
      const firstUser = selectedUsers.first()
      ownershipTransfer = firstUser?.id ?? ''
    } catch {
      ownershipTransfer = ''
    }
  }

  const parts: Array<string> = []
  // For ownership transfers, always show project type explicitly
  if (type === 'transfer_ownership' && ownershipType) {
    parts.push(`Project type: ${ownershipType}`)
  }
  // For reports, include the selected report type for clarity
  if (type && type.startsWith('report_') && reportSelectedLabel) {
    parts.push(`Report type: ${reportSelectedLabel}`)
  }
  // For other modal, include the selected category
  if (type === 'other' && selectedCategoryType) {
    const categoryLabels: Record<string, string> = {
      account: 'Account Issue',
      ban_appeal: 'Ban Appeal',
      bug: 'Bug Report',
      other: 'Other Issue',
      project_listing: 'Project Listing Issue',
      unable_to_vote: 'Unable to Vote Issue',
    }
    parts.push(
      `Category: ${
        categoryLabels[selectedCategoryType] || selectedCategoryType
      }`
    )
  }
  if (entityID.trim()) {
    const label =
      (type && idLabels[type as keyof typeof idLabels]) ?? 'Entity/User ID'
    parts.push(`${label}: ${entityID}`)
  }

  if (!ownershipTransfer.trim() && userInput.trim()) {
    parts.push(`Reason: ${userInput}`)
  }

  if (screenshot.trim()) {
    parts.push(`Screenshot: ${screenshot}`)
  }

  if (ownershipTransfer.trim()) {
    parts.push(
      `User to transfer to: <@${ownershipTransfer}> (${ownershipTransfer})`
    )
  }

  let messageContent = parts.join('\n\n')

  if (!messageContent.trim()) {
    messageContent = '[No details provided]'
  }

  const sentMessage = await webhook.send({
    content: messageContent,
    threadId: thread.id,
    allowedMentions: { users: [] },
  })
  await sentMessage.pin()
  // Delete the auto-generated system "pinned a message" notice
  try {
    const recent = await thread.messages.fetch({ limit: 5 })
    const pinNotice = recent.find(
      (m) => m.type === MessageType.ChannelPinnedMessage
    )
    if (pinNotice) {
      await pinNotice.delete().catch(() => {})
    }
  } catch {
    // ignore
  }
  await webhook.delete()

  await interaction.editReply({
    embeds: [
      successEmbed(
        'Ticket opened!',
        `Your ticket has been created at <#${thread.id}>. A moderator will assist you shortly.`
      ),
    ],
  })
}
