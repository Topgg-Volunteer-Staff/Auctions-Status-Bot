import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  CommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js'
import { roleIds } from '../globals'
import { emoji } from '../utils/emojis'

export const command = new SlashCommandBuilder()
  .setName('createmodticket')
  .setDescription('Post the create mod ticket message')
  .setContexts(InteractionContextType.Guild)
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
      .setCustomId(`modTicket_${interaction.id}`)
  )

  const embed = new EmbedBuilder()
    .setTitle('Contact a Top.gg Moderator')
    .setDescription(
      `Click the button below to open a **private thread/support ticket** with the <@&${roleIds.moderator}>, official moderators of Top.gg.\n\nUtilize these tickets to report users, request an ownership transfer, discuss a bot or review report, or any other reason that you might need to contact a Top.gg Moderator.\n\n${emoji.warning}**Note**: This is not the place to discuss review declines.`
    )
    .setColor('#ff3366')

  interaction.reply({
    embeds: [embed],
    components: [embedButtons],
  })
}
