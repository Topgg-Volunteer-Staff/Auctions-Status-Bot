import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  CommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js'
import { roleIds } from '../globals'

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
      `Click the button below to **open a private ticket** with the <@&${roleIds.moderator}>, official moderators of Top.gg.\n\nUse this to:\n- Report users, reviews, or entities\n- Request ownership transfer if you are unable to\n- Any other reason!\n\n:warning: This is not the place to discuss decline decisions. Please DM the Reviewer directly.`
    )
    .setColor('#ff3366')

  const channel = interaction.channel as TextChannel
  await channel.send({
    embeds: [embed],
    components: [embedButtons],
  })
}
