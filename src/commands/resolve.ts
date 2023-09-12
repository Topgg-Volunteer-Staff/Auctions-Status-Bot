import {
  ChannelType,
  Client,
  CommandInteraction,
  SlashCommandBuilder,
} from 'discord.js'
import { channelIds, resolvedFlag } from '../globals'
import { errorEmbed, successEmbed } from '../utils/embeds'
import { emoji } from '../utils/emojis'

export const command = new SlashCommandBuilder()
  .setName('resolve')
  .setDescription('Mark this auctions ticket as resolved')
  .setDMPermission(false)
  .setDefaultMemberPermissions('0')

export const execute = async (
  _client: Client,
  interaction: CommandInteraction
) => {
  if (interaction.channel?.type !== ChannelType.PrivateThread)
    return interaction.reply({
      embeds: [errorEmbed('This is not a thread!')],
      ephemeral: true,
    })
  if (interaction.channel.parent?.id !== channelIds.auctionsTickets)
    return interaction.reply({
      embeds: [errorEmbed(`This thread is not under #auctions-tickets!`)],
      ephemeral: true,
    })

  if (interaction.channel.name.startsWith(resolvedFlag))
    return interaction.reply({
      embeds: [errorEmbed(`This ticket is already resolved!`)],
      ephemeral: true,
    })

  await interaction.channel.setAutoArchiveDuration(1440, 'Ticket resolved!')

  // We can't rename threads due to rate limits
  interaction.channel
    .setName(`${resolvedFlag} ${interaction.channel.name}`)
    .catch(console.error)

  interaction.reply({
    embeds: [
      successEmbed(
        `Ticket Resolved!`,
        `If your issue persists or if you need help with a separate issue, please open a new ticket in <#${channelIds.auctionsTickets}>!\n\nThank you for using Top.gg Auctions! ${emoji.topggthumbsup}`
      ),
    ],
  })
  return
}
