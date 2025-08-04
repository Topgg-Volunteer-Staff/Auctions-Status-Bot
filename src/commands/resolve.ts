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

  try {
    await interaction.channel.setAutoArchiveDuration(1440, 'Ticket resolved!')
    await interaction.channel.setName(`${resolvedFlag} ${interaction.channel.name}`)
    await interaction.channel.setLocked(true, 'Ticket resolved and locked')
    await interaction.channel.setArchived(true, 'Ticket resolved and archived')
  } catch (err) {
    console.error('Failed to modify thread:', err)
    return interaction.reply({
      embeds: [errorEmbed(`Failed to resolve ticket. Please try again later.`)],
      ephemeral: true,
    })
  }

  let resolveString =
    'If your issue persists or if you need help with a separate issue, please open a new ticket in'

  if (interaction.channel.parent.id == channelIds.auctionsTickets) {
    resolveString += ` <#${channelIds.auctionsTickets}>!\n\nThank you for using Top.gg Auctions! ${emoji.topggthumbsup}`
  } else if (interaction.channel.parent.id == channelIds.modTickets) {
    resolveString += ` <#${channelIds.modTickets}>!\n\nThank you for contacting our Moderators! ${emoji.topggthumbsup}`
  }

  return interaction.reply({
    embeds: [successEmbed(`Ticket Resolved!`, `${resolveString}`)],
  })
}

