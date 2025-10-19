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

  // Handle the new unified report modal
  if (type === 'report') {
    // Get the report type from the select menu value
    let reportType = 'other'
    try {
      const reportTypeValues =
        interaction.fields.getStringSelectValues('reportType')
      const selectedValue = reportTypeValues[0] // Get the first selected value

      // Map the select menu values to report types
      const valueMap: Record<string, string> = {
        eb6bd3a320984ac0bc0f68b3d7e475e6: 'user',
        '2ff456c1bd4545e1b7f12e6d07e6d012': 'bot',
        '8705f9f12c084938a0be8d06d4766237': 'server',
        '56425f6f71974ee995c870c1e0a31052': 'review',
        c4cbfd581fb24e3ead3f852ff9e34b87: 'other',
      }
      reportType = selectedValue ? valueMap[selectedValue] || 'other' : 'other'
    } catch {
      // If no report type provided, default to other
    }

    // Map the report type to the old naming for compatibility
    const reportTypeMap: Record<string, string> = {
      bot: 'report_bot',
      server: 'report_server',
      user: 'report_user',
      review: 'report_review',
      other: 'report_other',
    }

    type = reportTypeMap[reportType] || 'report_other'
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
  if (type && type.startsWith('report_')) {
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
    // For ownership transfers, the main entity is the bot/server link.
    // The target user ID is appended separately later as "User ID to transfer to".
    modReasonField = ''
    entityIDField = 'modOwnershipBotOrServer'
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

  // 🔹 Different cases for different buttons
  let descriptionExtra = ''
  switch (type) {
    case 'report_other':
      descriptionExtra = `${emoji.bot} This ticket was opened for **other reasons.**`
      break
    case 'report_bot':
      descriptionExtra = `${emoji.bot} This ticket was opened to **report a bot.**`
      break
    case 'report_review':
      descriptionExtra = `${emoji.bot} This ticket was opened to **report a review.**`
      break
    case 'report_server':
      descriptionExtra = `${emoji.bot} This ticket was opened to **report a server.**`
      break
    case 'report_user':
      descriptionExtra = `${emoji.bot} This ticket was opened to **report a user.**`
      break
    case 'transfer_ownership':
      descriptionExtra = `${emoji.bot} This ticket was opened to **request an ownership transfer.**`
      break
    case 'contactuser':
      descriptionExtra = `${emoji.bot} This ticket was opened to **contact a user.**`
      break
    default:
      descriptionExtra = `${emoji.bot} **General moderator ticket.**`
      break
  }

  const embed = new EmbedBuilder()
    .setTitle(`This is your private ticket, ${interaction.user.username}!`)
    .setDescription(
      `${descriptionExtra}\n\nPlease provide any additional context or evidence if applicable.\n\n${emoji.dotred} For auction related help, create a ticket in <#1012032743250595921> instead.\n${emoji.dotred} A mod will respond as soon as possible. Please don’t ping individual staff.`
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
    report_server: 'Server link',
    report_bot: 'Bot link',
    report_user: 'User ID',
    report_review: 'Bot/Server link',
    transfer_ownership: 'Bot/Server link',
    report_other: '',
  }

  let screenshot = ''
  try {
    screenshot = interaction.fields.getTextInputValue('screenshot')
  } catch {
    screenshot = ''
  }

  let ownershipTransfer = ''
  try {
    ownershipTransfer =
      interaction.fields.getTextInputValue('modOwnershipUserID')
  } catch {
    ownershipTransfer = ''
  }

  const parts: Array<string> = []
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
    parts.push(`User ID to transfer to: ${ownershipTransfer}`)
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
