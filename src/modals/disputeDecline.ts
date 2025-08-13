import {
  ModalSubmitInteraction,
  Client,
  ChannelType,
  EmbedBuilder,
  TextChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { emoji } from '../utils/emojis';
import { channelIds } from '../globals';
import { errorEmbed, successEmbed } from '../utils/embeds';

export const modal = {
  name: 'disputeDecline',
};

export const execute = async (
  _client: Client,
  interaction: ModalSubmitInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return;
  await interaction.deferReply({ ephemeral: true });

  let disputeReason = '';
  try {
    disputeReason = interaction.fields.getTextInputValue('disputeReason');
  } catch {
    disputeReason = '';
  }

  const modTickets = interaction.client.channels.cache.get(
    channelIds.modTickets
  ) as TextChannel | undefined;
  if (!modTickets) {
    await interaction.editReply({
      embeds: [errorEmbed('Error', 'Mod tickets channel not found.')],
    });
    return;
  }

  const activeThreads = await modTickets.threads.fetchActive();
  const existingThread = activeThreads.threads.find(
    (t) => t.name === interaction.user.username
  );
  if (existingThread) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Can’t open a new dispute!',
          `You already have an open dispute here: <#${existingThread.id}>`
        ),
      ],
    });
    return;
  }

  // Create ticket thread
  const embed = new EmbedBuilder()
    .setTitle(`Dispute Ticket for ${interaction.user.username}`)
    .setDescription(
      `${emoji.bot} This ticket was opened to **dispute a decline**.\n\n**Appeal Message:** ${disputeReason || 'N/A'
      }\n\nPlease provide any additional evidence or reasoning below.`
    )
    .setColor('#ff3366');

  const thread = await modTickets.threads.create({
    name: interaction.user.username,
    type: ChannelType.PrivateThread,
    autoArchiveDuration: 10080,
  });

  await thread.send({
    content: `<@${interaction.user.id}> has opened a dispute.`,
    embeds: [embed],
  });

  // Close button
  const closeButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`closeModTicket_${interaction.user.id}`)
      .setLabel('Close Dispute')
      .setStyle(ButtonStyle.Danger)
  );

  await thread.send({
    embeds: [
      new EmbedBuilder()
        .setColor('#ff3366')
        .setDescription(`${emoji.dotred} You can close this dispute below.`),
    ],
    components: [closeButton],
  });

  // Look up last mod-logs message that pinged the ticket opener and extract reviewer
  const modLogs = interaction.client.channels.cache.get(
    channelIds.modlogs
  ) as TextChannel | undefined;

  if (modLogs) {
    const fetched = await modLogs.messages.fetch({ limit: 100 });

    const lastPingedMessage = fetched
      .filter((msg) => msg.mentions.has(interaction.user.id))
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
      .first();

    if (lastPingedMessage) {
      // Forward the original message's content with attribution
      await thread.send({
        content: `**Forwarded message**`,
      });

      await thread.send({
        ...(lastPingedMessage.content && { content: lastPingedMessage.content }),
        embeds: lastPingedMessage.embeds,
        files: lastPingedMessage.attachments.map(att => ({ attachment: att.url })),
      });

      const embed = lastPingedMessage.embeds[0];
      if (embed) {
        const reviewerField = embed.fields.find(
          (f) => f.name.toLowerCase() === 'reviewer'
        );

        if (reviewerField) {
          const mentionMatch = reviewerField.value.match(/<@!?(\d+)>/);
          if (mentionMatch) {
            const reviewerId = mentionMatch[1];

            try {
              await thread.members.add(reviewerId as any);
              await thread.send(
                `<@${reviewerId}> You reviewed this bot; please check the dispute.`
              );
            } catch (err) {
              console.error('Could not add reviewer to thread:', err);
            }
          }
        }
      }
    }
  }

  await interaction.editReply({
    embeds: [
      successEmbed(
        'Dispute opened!',
        `Your dispute has been created at <#${thread.id}>. A moderator will assist you shortly.`
      ),
    ],
  });
};
