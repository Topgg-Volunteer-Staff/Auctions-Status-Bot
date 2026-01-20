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
  type Collection,
  type Attachment,
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
  } else if (type === 'other') {
    modReasonField = 'modReason'
    entityIDField = ''
  } else if (type === 'modOwnershipUserID') {
    modReasonField = 'modOwnershipUserID'
    entityIDField = ''
  } else if (type === 'modOwnershipBotOrServer') {
    modReasonField = 'modOwnershipBotOrServer'
    entityIDField = ''
  }
  if (type === 'transfer_ownership') {
    // For ownership transfers: entity is the provided project ID from the modal
    modReasonField = 'ownershipProof'
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
      const raw = interaction.fields.getTextInputValue('ownershipType')
      const normalized = raw.trim().toLowerCase()
      if (normalized === 'bot' || normalized === 'server') {
        selectedOwnershipType = normalized
      } else if (normalized.startsWith('b')) {
        selectedOwnershipType = 'bot'
      } else if (normalized.startsWith('s')) {
        selectedOwnershipType = 'server'
      } else {
        selectedOwnershipType = ''
      }
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
    case 'other': {
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
    }
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

  const closeLine = `${emoji.dotred} If this ticket was opened by mistake, you can close it below.`

  const baseDescription =
    type === 'transfer_ownership'
      ? descriptionExtra
      : `${descriptionExtra ? descriptionExtra + '\n\n' : ''}${
          emoji.dotred
        } Please provide any additional context or evidence if applicable.\n${
          emoji.dotred
        } A mod will respond as soon as possible. Please don't ping individual staff.`

  const embed = new EmbedBuilder()
    .setTitle(`${titleExtra}`)
    .setDescription(`${baseDescription}\n\n${closeLine}`)
    .setColor('#ff3366')

  let threadName = interaction.user.username
  if (type) {
    if (type.startsWith('report_')) {
      const reportType = type.split('_')[1] || 'Other' // Get the part after 'report_'
      const reportTypeMap: Record<string, string> = {
        bot: 'Bot',
        server: 'Server',
        user: 'User',
        review: 'Review',
        other: 'Other',
      }
      const displayType = reportTypeMap[reportType] || 'Other'
      threadName = `Report ${displayType} - ${interaction.user.username}`
    } else if (type === 'transfer_ownership') {
      const displayType = selectedOwnershipType === 'bot' ? 'Bot' : 'Server'
      threadName = `Transfer ${displayType} - ${interaction.user.username}`
    } else if (type === 'other' && selectedCategoryType) {
      const categoryLabels: Record<string, string> = {
        account: 'Account',
        ban_appeal: 'Ban Appeal',
        bug: 'Bug',
        project_listing: 'Listing',
        unable_to_vote: 'Voting',
        other: 'Ticket',
      }
      const prefix = categoryLabels[selectedCategoryType] || 'Ticket'
      threadName = `${prefix} - ${interaction.user.username}`
    }
  }

  const thread = await modTickets.threads.create({
    name: threadName,
    type: ChannelType.PrivateThread,
    autoArchiveDuration: 10080,
  })

  const closeButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`closeModTicket_${interaction.user.id}`)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
  )

  // Send the initial embed together with the close button (single embed + button)
  await thread.send({
    content: `<@&${roleIds.modNotifications}>, <@${interaction.user.id}> has created a ticket.`,
    embeds: [embed],
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
    report_other: 'ID',
  }

  // Ownership type (only for transfer ownership modal)
  let ownershipType = ''
  if (type === 'transfer_ownership') {
    ownershipType =
      selectedOwnershipType === 'bot'
        ? 'Bot'
        : selectedOwnershipType === 'server'
        ? 'Server'
        : ''
  }

  // Extract uploaded screenshot files (if any)
  let uploadedScreenshots: Array<Attachment> = []
  try {
    const files = interaction.fields.getUploadedFiles('screenshot') as
      | Collection<string, Attachment>
      | undefined
    uploadedScreenshots = files ? Array.from(files.values()) : []
  } catch {
    uploadedScreenshots = []
  }

  // Ownership transferee (only for transfer ownership modal)
  let ownershipTransfer = ''
  if (type === 'transfer_ownership') {
    try {
      const raw = interaction.fields.getTextInputValue('ownershipTransfer')
      const trimmed = raw.trim()
      // Accept <@123>, <@!123>, or raw numeric ID
      const match = trimmed.match(/^(?:<@!?(\d+)>|(\d+))$/)
      ownershipTransfer = (match?.[1] || match?.[2] || '').trim()
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
    ...(uploadedScreenshots.length > 0 && { files: uploadedScreenshots }),
  })
  await sentMessage.pin()
  // Delete the auto-generated system "pinned a message" notice
  try {
    const recent = await thread.messages.fetch({ limit: 5 })
    const pinNotice = recent.find(
      (m) => m.type === MessageType.ChannelPinnedMessage
    )
    if (pinNotice) {
      await pinNotice.delete().catch(() => void 0)
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
