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
  name: 'auctionsTicket',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const auctionsTickets = interaction.client.channels.cache.get(
    channelIds.auctionsTickets
  ) as TextChannel
  const openTicket =
    (await auctionsTickets.threads.fetchActive()).threads.filter(
      (t) => 
        t.name === `${interaction.user.username}` 
        && t.archived === false
        && t.members.filter((m) => m.id === interaction.user.id).size >= 1
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
          `You already have an open Auctions support ticket. Please go to <#${yourTicket?.id}> for support.`
        ),
      ],
      ephemeral: true,
    })
  }
  const embed = new EmbedBuilder()
    .setTitle(
      `This is your Private Top.gg Auctions Support Thread, ${interaction.user.username}!`
    )
    .setDescription(
      `Please state your question or what you are having an issue with in this thread.\n\n${emoji.dotred} If your issue is related to payments you have made, please make sure to include your FastSpring order ID starting with \`DBOTSBV••••\`. You can find the invoice ID in the payment confirmation email you received from FastSpring.\n\nA Support Team member will be with you as soon as possible!`
    )
    .setColor('#ff3366')

  const channel = interaction.client.channels.cache.get(
    channelIds.auctionsTickets
  ) as TextChannel

  channel.threads
    .create({
      name: `${interaction.user.username}`,
      autoArchiveDuration: 10080,
      type: ChannelType.PrivateThread,
    })
    .then((thread) => {
      thread.send({
        content: `<@&${roleIds.supportTeam}>, <@${interaction.user.id}> has created an Auctions ticket.`,
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
