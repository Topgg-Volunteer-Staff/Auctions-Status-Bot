import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  CommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from 'discord.js'
import { roleIds } from '../globals'

export const command = new SlashCommandBuilder()
  .setName('createticket')
  .setDescription('Post the create ticket message')
  .setDMPermission(false)
  .setDefaultMemberPermissions('0')

export const execute = async (
  _client: Client,
  interaction: CommandInteraction
) => {
  //   if (
  //     interaction.channel?.id !==
  //     _client.channels.cache.get(channelIds.auctionsTickets)
  //   )
  //     return

  const embedButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel(`Create Ticket`)
      .setStyle(ButtonStyle.Primary)
      .setCustomId(`auctionsTicket_${interaction.id}`)
  )

  const embed = new EmbedBuilder()
    .setTitle('Private Auctions Support')
    .setDescription(
      `Click the button below to open a **private thread/support ticket** with the <@&${roleIds.supportTeam}>, official employees of Top.gg.\n\nFeel free to open a private ticket for any reason, but especially for any issue that may contain confidential information, such as order IDs or email addresses.`
    )
    .setColor('#ff3366')

  interaction.channel?.send({
    embeds: [embed],
    components: [embedButtons],
  })
}
