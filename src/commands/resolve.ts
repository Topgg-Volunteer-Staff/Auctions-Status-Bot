import {
  ChannelType,
  Client,
  CommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits,
} from 'discord.js'

import { channelIds, resolvedFlag } from '../globals'
import { errorEmbed, successEmbed } from '../utils/embeds'
import { emoji } from '../utils/emojis'

export const command = new SlashCommandBuilder()
  .setName('resolve')
  .setDescription('Mark this auctions or mod ticket as resolved')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)

export const execute = async (
  _client: Client,
  interaction: CommandInteraction
) => {
  if (interaction.channel?.type !== ChannelType.PrivateThread)
    return interaction.reply({
      embeds: [errorEmbed('This is not a thread!')],
      ephemeral: true,
    })

  if (interaction.channel.name.startsWith(resolvedFlag))
    return interaction.reply({
      embeds: [errorEmbed(`This ticket is already resolved!`)],
      ephemeral: true,
    })

  if (
    interaction.channel.parent?.id !== channelIds.auctionsTickets &&
    interaction.channel.parent?.id !== channelIds.modTickets
  )
    return interaction.reply({
      embeds: [errorEmbed(`This thread is not resolvable!`)],
      ephemeral: true,
    })

  interaction.channel.setAutoArchiveDuration(1440, 'Ticket resolved!')

  // We can't rename threads due to rate limits
  interaction.channel
    .setName(`${resolvedFlag} ${interaction.channel.name}`)
    .catch(console.error)

  let resolveString =
    'If your issue persists or if you need help with a seperate issue, please open a new ticket in'
  if (interaction.channel.parent?.id == channelIds.auctionsTickets) {
    resolveString += ` <#${channelIds.auctionsTickets}>!\n\nThank you for using Top.gg Auctions! ${emoji.topggthumbsup}`
  } else if (interaction.channel.parent?.id == channelIds.modTickets) {
    resolveString += ` <#${channelIds.modTickets}>!\n\nThank you for contacting our Moderators! ${emoji.topggthumbsup}`
  }

  interaction.reply({
    embeds: [successEmbed(`Ticket Resolved!`, `${resolveString}`)],
  })
  return
}
