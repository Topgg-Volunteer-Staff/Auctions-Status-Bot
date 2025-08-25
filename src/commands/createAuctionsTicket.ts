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
  .setName('createauctionsticket')
  .setDescription('Post the create auctions ticket message')
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

  const channel = interaction.channel as TextChannel

  // Delete existing auctions ticket messages
  try {
    const messages = await channel.messages.fetch({ limit: 100 })
    for (const [, message] of messages) {
      if (message.embeds.length > 0) {
        const embed = message.embeds[0]
        if (
          embed &&
          embed.title &&
          embed.title.includes('Private Auctions Support')
        ) {
          await message.delete()
        }
      }
    }
  } catch (error) {
    console.warn('Failed to delete existing auctions ticket messages:', error)
  }

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

  await channel.send({
    embeds: [embed],
    components: [embedButtons],
  })

  await interaction.reply({
    content: 'Auctions ticket message sent.',
    ephemeral: true,
  })
}
