import {
  ChannelType,
  Client,
  CommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
  PermissionFlagsBits,
  ThreadChannel,
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
): Promise<void> => {
  if (interaction.channel?.type !== ChannelType.PrivateThread) {
    await interaction.reply({
      embeds: [errorEmbed('This is not a thread!')],
      ephemeral: true,
    })
    return
  }

  if (interaction.channel.name.startsWith(resolvedFlag)) {
    await interaction.reply({
      embeds: [errorEmbed(`This ticket is already resolved!`)],
      ephemeral: true,
    })
    return
  }

  if (
    interaction.channel.parent?.id !== channelIds.auctionsTickets &&
    interaction.channel.parent?.id !== channelIds.modTickets
  ) {
    await interaction.reply({
      embeds: [errorEmbed(`This thread is not resolvable!`)],
      ephemeral: true,
    })
    return
  }

  try {
    await interaction.channel.setAutoArchiveDuration(1440, 'Ticket resolved!')
    await interaction.channel.setName(
      `${resolvedFlag} ${interaction.channel.name}`
    )

    let resolveString =
      'If your issue persists or if you need help with a different issue, please open a new ticket in'

    if (interaction.channel.parent.id === channelIds.auctionsTickets) {
      resolveString += ` <#${channelIds.auctionsTickets}>!\n\nThank you for using Top.gg Auctions! ${emoji.dogThumbUp}`
    } else {
      resolveString += ` <#${channelIds.modTickets}>!\n\nThank you for contacting our mods! ${emoji.dogThumbUp}`
    }

    await interaction.reply({
      embeds: [successEmbed(`Ticket resolved!`, `${resolveString}`)],
    })

    if (!interaction.guild) {
      throw new Error('Guild is not available on this interaction')
    }

    const isModTicket =
      interaction.channel.parent?.id === channelIds.modTickets

    if (isModTicket) {
      const thread = await interaction.guild.channels.fetch(
        interaction.channel.id
      )

      if (!(thread instanceof ThreadChannel)) {
        throw new Error('Channel is not a thread')
      }

      // Lock the thread (prevents new messages)
      await thread.setLocked(true, 'Ticket resolved and locked')

      // Wait to let Discord process lock before archive
      await new Promise((res) => setTimeout(res, 750))

      await thread.setArchived(true, 'Ticket resolved and archived')

      // Double-check and force archive if needed
      const updatedThread = await interaction.guild.channels.fetch(thread.id)
      if (updatedThread instanceof ThreadChannel && !updatedThread.archived) {
        await updatedThread.setArchived(
          true,
          'Force archive after failed first attempt'
        )
      }
    }
  } catch (err) {
    console.error('Failed to resolve ticket:', err)

    // If you already replied, use followUp else reply
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        embeds: [
          errorEmbed(`Failed to resolve ticket. Please try again later.`),
        ],
        ephemeral: true,
      })
    } else {
      await interaction.reply({
        embeds: [
          errorEmbed(`Failed to resolve ticket. Please try again later.`),
        ],
        ephemeral: true,
      })
    }
  }
}
