import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
  createTextPanel,
} from '../utils/componentsV2'
import {
  DISPUTE_AUDIT_BUTTON,
  DISPUTE_AUDIT_QUESTION,
} from '../utils/tickets/disputeAuditPrompt'
import { isDisputeThreadName } from '../utils/tickets/disputeThread'
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

  // Disputes are audited before anything is resolved: the buttons carry the
  // resolve through once the question is answered.
  if (parent.id === channelIds.modTickets && isDisputeThreadName(thread.name)) {
    await interaction.reply({
      components: [
        createTextPanel({
          accentColor: 0xff3366,
          title: 'Before this dispute is resolved',
          description: DISPUTE_AUDIT_QUESTION,
        }).addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`${DISPUTE_AUDIT_BUTTON}_yes_${thread.id}`)
              .setLabel('Yes')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`${DISPUTE_AUDIT_BUTTON}_no_${thread.id}`)
              .setLabel('No')
              .setStyle(ButtonStyle.Danger)
          )
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      allowedMentions: { parse: [] },
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
