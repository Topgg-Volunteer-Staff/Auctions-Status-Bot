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
  const entityID = interaction.fields.getTextInputValue('entityID')

  const embed = new EmbedBuilder()
    .setTitle(`This is your private ticket, ${interaction.user.username}!`)
    .setDescription(
      `Please provide any additional context or evidence if applicable.\n\n${emoji.dotred} A Moderator will answer you as soon as they are able to do so. Please do not ping individual Moderators for assistance.`
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

  // Create webhook on parent channel to mimic user message in thread
  const webhook = await modTickets.createWebhook({
    name: interaction.user.username,
    avatar: interaction.user.displayAvatarURL(),
  })

  let messageContent = userInput
  if (entityID.trim()) {
    messageContent += `\n\nEntity/User ID: \`${entityID}\``
  }

  await webhook.send({
    content: messageContent,
    threadId: thread.id,
  })

  // Delete webhook after use !!
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
