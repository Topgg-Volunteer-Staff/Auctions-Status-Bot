import {
  ModalSubmitInteraction,
  Client,
  ChannelType,
  EmbedBuilder,
  TextChannel,
  MessageFlags,
} from 'discord.js'
import { channelIds, roleIds } from '../globals'
import { errorEmbed, successEmbed } from '../utils/embeds'

// Import JSON mapping of trial mentors. Use require cast to keep TypeScript happy
const trialMentors: Record<
  string,
  string
> = require('../data/trialMentors.json')

export const modal = {
  name: 'disputeDecline',
}

export const execute = async (
  _client: Client,
  interaction: ModalSubmitInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  let disputeID = ''
  try {
    disputeID = interaction.fields.getTextInputValue('disputeID').trim()
  } catch {
    disputeID = ''
  }
  const appealMessage = interaction.fields.getTextInputValue('reason').trim()

  if (!/^\d+$/.test(disputeID)) {
    await interaction.editReply({
      embeds: [
        errorEmbed('Invalid ID', 'Please provide a valid numeric bot ID.'),
      ],
    })
    return
  }

  const modTickets = interaction.client.channels.cache.get(
    channelIds.modTickets
  ) as TextChannel | undefined
  if (!modTickets) {
    await interaction.editReply({
      embeds: [errorEmbed('Error', 'Mod tickets channel not found.')],
    })
    return
  }

  // Prevent duplicate threads for this user
  const activeThreads = await modTickets.threads.fetchActive()
  const existingThread = activeThreads.threads.find(
    (t) => t.name === interaction.user.username
  )
  if (existingThread) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Can’t open a new dispute!',
          `You already have an open dispute here: <#${existingThread.id}>`
        ),
      ],
    })
    return
  }

  // Search modlogs for matching bot ID (only last 2 weeks)
  const modLogs = interaction.client.channels.cache.get(channelIds.modlogs) as
    | TextChannel
    | undefined
  if (!modLogs) {
    await interaction.editReply({
      embeds: [errorEmbed('Error', 'Mod logs channel not found.')],
    })
    return
  }

  let matchingMessage = null
  let lastId: string | undefined
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000 // 14 days ago

  while (!matchingMessage) {
    const fetched = await modLogs.messages.fetch({
      limit: 100,
      ...(lastId ? { before: lastId } : {}),
    })

    if (fetched.size === 0) break

    for (const msg of fetched.values()) {
      // Stop if older than cutoff
      if (msg.createdTimestamp < cutoff) {
        matchingMessage = null
        break
      }

      const embed = msg.embeds[0]
      if (!embed) continue

      const botField = embed.fields.find((f) => f.name.toLowerCase() === 'bot')
      if (!botField) continue

      const match = botField.value.match(/\((\d+)\)/)
      if (match && match[1] === disputeID) {
        // If the embed title is "Bot Approved", reject immediately
        if (embed.title?.toLowerCase() === 'bot approved') {
          await interaction.editReply({
            embeds: [
              errorEmbed(
                "Can't open ticket",
                `This bot was approved. If you need help with this bot, please ask in <#714045415707770900> or create a mod ticket above.`
              ),
            ],
          })
          return
        }

        matchingMessage = msg
        break
      }
    }

    const lastFetched = fetched.last()
    if (
      lastFetched?.createdTimestamp &&
      lastFetched.createdTimestamp < cutoff
    ) {
      break
    }

    lastId = lastFetched?.id
  }

  // If not found in last 2 weeks
  if (!matchingMessage) {
    const embed = new EmbedBuilder()
      .setTitle(`Dispute ticket for ${interaction.user.username}`)
      .setDescription(
        `**Bot ID:** ${disputeID}\n\nPlease provide any additional evidence or reasoning below.`
      )
      .setColor('#ff3366')

    const thread = await modTickets.threads.create({
      name: `Dispute - ${interaction.user.username}`,
      type: ChannelType.PrivateThread,
      autoArchiveDuration: 10080,
    })

    await thread.send({
      content: `<@${interaction.user.id}> has opened a dispute. <@&${roleIds.reviewerNotifications}> no decline log found for this bot - please investigate.`,
      embeds: [embed],
      allowedMentions: {
        users: [interaction.user.id],
        roles: [roleIds.reviewerNotifications],
      },
    })

    const webhook = await modTickets.createWebhook({
      name: interaction.user.username,
      avatar: interaction.user.displayAvatarURL(),
    })

    const sentMessage = await webhook.send({
      content: `${appealMessage}`,
      threadId: thread.id,
      allowedMentions: { users: [] },
    })
    await sentMessage.pin()
    await webhook.delete()

    await interaction.editReply({
      embeds: [
        successEmbed(
          'Dispute opened!',
          `No decline log was found for bot ID \`${disputeID}\`, but your dispute has been created at <#${thread.id}>.`
        ),
      ],
    })
    return
  }

  // Create ticket when matching message found
  const embed = new EmbedBuilder()
    .setTitle(`Dispute ticket for ${interaction.user.username}`)
    .setDescription(
      `**See decline here:** ${matchingMessage.url}\n\nPlease provide any additional evidence or reasoning below.`
    )
    .setColor('#ff3366')

  const thread = await modTickets.threads.create({
    name: `Dispute - ${interaction.user.username}`,
    type: ChannelType.PrivateThread,
    autoArchiveDuration: 10080,
  })

  let reviewerId = ''
  let mentorId = ''
  const logEmbed = matchingMessage.embeds[0]
  if (logEmbed) {
    const reviewerField = logEmbed.fields.find(
      (f) => f.name.toLowerCase() === 'reviewer'
    )
    if (reviewerField) {
      const reviewerMatch = reviewerField.value.match(/<@!?(\d+)>/)
      if (reviewerMatch && reviewerMatch[1]) {
        const potentialReviewerId = reviewerMatch[1]

        try {
          const reviewerMember = await interaction.guild.members.fetch(
            potentialReviewerId
          )

          // If reviewer has the regular reviewer role, use them.
          if (reviewerMember.roles.cache.has(roleIds.reviewer)) {
            reviewerId = potentialReviewerId
          } else {
            // If reviewer has the Trial Reviewer role, ping reviewer and their mentor (from JSON)
            const trialRoleId = '767392998157451265'
            if (reviewerMember.roles.cache.has(trialRoleId)) {
              reviewerId = potentialReviewerId
              // trialMentors is a JSON object mapping reviewer user IDs -> mentor user IDs
              mentorId =
                (trialMentors as Record<string, string>)[potentialReviewerId] ||
                ''
            }
          }
        } catch {
          console.log(
            `Reviewer ${potentialReviewerId} not found or not accessible`
          )
        }
      }
    }
  }

  await thread.send({
    content: `<@${interaction.user.id}> has opened a dispute.${
      reviewerId
        ? ` <@${reviewerId}> please take a look.${
            mentorId ? ` <@${mentorId}> (mentor) please assist.` : ''
          }`
        : ` <@&${roleIds.reviewerNotifications}> no valid reviewer - please investigate.`
    }`,
    embeds: [embed],
    allowedMentions: {
      users: [
        interaction.user.id,
        ...(reviewerId ? [reviewerId] : []),
        ...(mentorId ? [mentorId] : []),
      ],
      roles: [roleIds.reviewerNotifications],
    },
  })

  let forwardContent = matchingMessage.content || ''
  forwardContent = forwardContent.replace(/<@&?\d+>/g, '').trim()

  await thread.send({
    ...(forwardContent && { content: forwardContent }),
    embeds: matchingMessage.embeds,
    files: matchingMessage.attachments.map((att) => ({ attachment: att.url })),
    allowedMentions: { parse: [] },
  })

  const webhook = await modTickets.createWebhook({
    name: interaction.user.username,
    avatar: interaction.user.displayAvatarURL(),
  })

  const sentMessage = await webhook.send({
    content: `${appealMessage}`,
    threadId: thread.id,
    allowedMentions: { users: [] },
  })
  await sentMessage.pin()
  await webhook.delete()

  await interaction.editReply({
    embeds: [
      successEmbed(
        'Dispute opened!',
        `Your dispute has been created at <#${thread.id}>. A reviewer will assist you shortly.`
      ),
    ],
  })
}
