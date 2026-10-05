import {
  ChannelType,
  Client,
  CommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
  ThreadChannel,
} from 'discord.js'

import { channelIds, resolvedFlag } from '../globals'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
} from '../utils/componentsV2'
import { resolveTicket } from '../utils/tickets/resolveTicket'

export const command = new SlashCommandBuilder()
  .setName('resolve')
  .setDescription('Mark this auctions or mod ticket as resolved')
  .setContexts(InteractionContextType.Guild)

export const execute = async (
  client: Client,
  interaction: CommandInteraction
): Promise<void> => {
  const ch = interaction.channel
  if (!ch || ch.type !== ChannelType.PrivateThread) {
    await interaction.reply({
      components: [createErrorPanel('This is not a thread!')],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const thread = ch as ThreadChannel

  if (thread.name.startsWith(resolvedFlag)) {
    await interaction.reply({
      components: [createErrorPanel(`This ticket is already resolved!`)],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const parent = thread.parent
  if (
    !parent ||
    (parent.id !== channelIds.auctionsTickets &&
      parent.id !== channelIds.modTickets)
  ) {
    await interaction.reply({
      components: [createErrorPanel(`This thread is not resolvable!`)],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  try {
    await resolveTicket({
      client,
      thread,
      parentId: parent.id,
      resolvedByUserId: interaction.user.id,
      resolvedAt: interaction.createdAt,
      command: 'resolve',
      announce: (components) =>
        interaction.reply({
          components,
          flags: COMPONENTS_V2_FLAGS,
          allowedMentions: { parse: [] },
        }),
    })
  } catch (err) {
    console.error('Failed to resolve ticket:', err)

    // If you already replied, use followUp else reply
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        components: [
          createErrorPanel(`Failed to resolve ticket. Please try again later.`),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
    } else {
      await interaction.reply({
        components: [
          createErrorPanel(`Failed to resolve ticket. Please try again later.`),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
    }
  }
}
