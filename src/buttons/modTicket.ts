import {
  ButtonInteraction,
  ChannelType,
  Client,
  EmbedBuilder,
  TextChannel,
} from 'discord.js'
import { channelIds, roleIds } from '../globals'
import { emoji } from '../utils/emojis'
import { errorEmbed, successEmbed } from '../utils/embeds'

export const button = {
  name: 'modTicket',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return

  // Fetch the mod tickets channel
  const channel = interaction.client.channels.cache.get(channelIds.modTickets)

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          'Configuration Error',
          'The moderator tickets channel could not be found or is not a text channel.'
        ),
      ],
      ephemeral: true,
    })
    return
  }

  const modTickets = channel as TextChannel

  // Check if user already has an open ticket
  const activeThreads = await modTickets.threads.fetchActive()
  const existingThread = activeThreads.threads.find(
    (t) => t.name === interaction.user.username
  )

  if (existingThread) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          'Ticket Already Open',
          `You already have an open Moderator Support ticket. Please go to <#${existingThread.id}> for help.`
        ),
      ],
      ephemeral: true,
    })
    return
  }

  // Create embed for the new thread
  const embed = new EmbedBuilder()
    .setTitle(
      `This is your Private Top.gg Moderator Support Thread, ${interaction.user.username}!`
    )
    .setDescription(
      `Please state your question, report, or what you are having an issue with in this thread.\n\n${emoji.dotred} A Moderator will answer you as soon as they are able to do so. Please do not ping individual Moderators for assistance.`
    )
    .setColor('#ff3366')

  // Create the private thread
  const thread = await modTickets.threads.create({
    name: interaction.user.username,
    autoArchiveDuration: 10080,
    type: ChannelType.PrivateThread,
  })

  // Notify moderators in the thread
  await thread.send({
    content: `<@&${roleIds.modNotifications}>, <@${interaction.user.id}> has created a Moderator Support ticket.`,
    embeds: [embed],
  })

  // Respond to the user
  await interaction.reply({
    embeds: [
      successEmbed(
        'Ticket Opened!',
        `Your ticket has been created at <#${thread.id}>. Please head there for assistance!`
      ),
    ],
    ephemeral: true,
  })
}
