import {
  ModalSubmitInteraction,
  Client,
  ChannelType,
  EmbedBuilder,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
  await interaction.deferReply({ ephemeral: true })

  // Extract type from modal's customId
  const match = interaction.customId.match(/^modModal_(.+)$/)
  if (!match) return
  const type = match[1]

  const modTickets = interaction.client.channels.cache.get(
    channelIds.modTickets
  ) as TextChannel | undefined

  if (!modTickets) {
    await interaction.editReply({
      embeds: [errorEmbed('Error', 'Mod tickets channel not found.')],
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
          `You already have an open Moderator Support ticket. Please go to <#${existingThread.id}> for support.`
        ),
      ],
    })
    return
  }

  const userInput = interaction.fields.getTextInputValue('modReason')
let entityID = '';
try {
  entityID = interaction.fields.getTextInputValue('entityID');
} catch {
  entityID = '';
}

  // 🔹 Different cases for different buttons
  let descriptionExtra = ''
  switch (type) {
    case 'otherreport':
      descriptionExtra = `${emoji.bot} This ticket was opened for **Other Report**.`
      break
    case 'reportbot':
      descriptionExtra = `${emoji.bot} This ticket was opened to **report a bot.**`
      break
    case 'reportreview':
      descriptionExtra = `${emoji.bot} This ticket was opened to **report a review.**`
      break
    case 'reportserver':
      descriptionExtra = `${emoji.bot} This ticket was opened to **report a server.**`
      break
    case 'reportuser':
      descriptionExtra = `${emoji.bot} This ticket was opened to **report a user.**`
      break
    case 'requestownershiptransfer':
      descriptionExtra = `${emoji.bot} This ticket was opened for an **ownership transfer request.**`
      break
    default:
      descriptionExtra = `${emoji.bot} **General moderator ticket.**`
      break
  }

  const embed = new EmbedBuilder()
    .setTitle(`This is your private ticket, ${interaction.user.username}!`)
    .setDescription(
      `${descriptionExtra}\n\nPlease provide any additional context or evidence if applicable.\n\n${emoji.dotred} A Moderator will answer you as soon as they are able to do so. Please do not ping individual Moderators for assistance.`
    )
    .setColor('#ff3366')

  const thread = await modTickets.threads.create({
    name: interaction.user.username,
    type: ChannelType.PrivateThread,
    autoArchiveDuration: 10080,
  })

  await thread.send({
    content: `<@&${roleIds.modNotifications}>, <@${interaction.user.id}> has created a Moderator Support ticket.`,
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
    reportserver: 'Server ID',
    reportbot: 'Bot ID',
    reportuser: 'User ID',
    reportreview: 'Review ID',
    requestownershiptransfer: 'Server ID',
    otherreport: 'Entity/User ID'
  };
  let messageContent = userInput;
if (entityID.trim()) {
  const label =
    (type && idLabels[type as keyof typeof idLabels]) ?? 'Entity/User ID';
  messageContent += `\n\n${label}: \`${entityID}\``;
}

  await webhook.send({
    content: messageContent,
    threadId: thread.id,
  })

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

