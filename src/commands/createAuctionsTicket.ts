import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  CommandInteraction,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { roleIds } from '../globals'
import { createTextPanel } from '../utils/componentsV2'

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

  const embedButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel(`Create Ticket`)
      .setStyle(ButtonStyle.Primary)
      .setCustomId(`auctionsTicket_${interaction.id}`)
  )

  const panel = createTextPanel({
    accentColor: 0xff3366,
    title: 'Private Auctions Support',
    description: `Click the button below to open a **private thread/support ticket** with the <@&${roleIds.supportTeam}>, official employees of Top.gg.\n\nFeel free to open a private ticket for any reason, but especially for any issue that may contain confidential information, such as order IDs or email addresses.`,
  }).addActionRowComponents(embedButtons)

  interaction.reply({
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  })
}
