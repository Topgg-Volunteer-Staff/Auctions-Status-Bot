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
) => {
  if (!interaction.inCachedGuild()) return

  const modTickets = interaction.client.channels.cache.get(
    channelIds.modTickets
  ) as TextChannel
  const openTicket =
    (await modTickets.threads.fetchActive()).threads.filter(
      (t) => t.name === `${interaction.user.username}`
    ).size >= 1
      ? true
      : false

  if (openTicket) {
    const yourTicket = (await auctionsTickets.threads.fetchActive()).threads
      .filter((t) => t.name === `${interaction.user.username}`)
      .first()
    return interaction.reply({
      embeds: [
        errorEmbed(
          `Can't open a new ticket!`,
          `You already have an open Moderator Support ticket. Please go to <#${yourTicket?.id}> for help.`
        ),
      ],
      ephemeral: true,
    })
    return
  }

  let description = `Please state your question, report, or what you are having an issue with in this thread.\n\n${emoji.dotred} A Moderator will answer you as soon as they are able to do so. Please do not ping individual Moderators for assistance.`

  const embed = new EmbedBuilder()
    .setTitle(
      `This is your Private Top.gg Moderator Support Thread, ${interaction.user.username}!`
    )
    .setDescription(
      description
    )
    .setColor('#ff3366')

  const channel = interaction.client.channels.cache.get(
    channelIds.modTickets
  ) as TextChannel

  channel.threads
    .create({
      name: `${interaction.user.username}`,
      autoArchiveDuration: 10080,
      type: ChannelType.PrivateThread,
    })
    .then((thread) => {
      thread.send({
        content: `<@&${roleIds.modNotifications}>, <@${interaction.user.id}> has created a Moderator Support ticket.`,
        embeds: [embed],
      })

      interaction.reply({
        embeds: [
          successEmbed(
            `Ticket opened!`,
            `Your ticket has been created at <#${thread.id}>, please head there for assistance!`
          ),
        ],
        ephemeral: true,
      })
    })
  return
}
