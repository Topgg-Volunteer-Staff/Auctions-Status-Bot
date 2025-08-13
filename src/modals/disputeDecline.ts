import {
  ModalSubmitInteraction,
  Client,
  ChannelType,
  EmbedBuilder,
  TextChannel,
} from 'discord.js'
import { channelIds, roleIds } from '../globals'
import { errorEmbed, successEmbed } from '../utils/embeds'
import { emoji } from '../utils/emojis'

export const modal = {
  name: 'disputeDecline',
}

export const execute = async (
  _client: Client,
  interaction: ModalSubmitInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return
  await interaction.deferReply({ ephemeral: true })

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

  // Search modlogs for matching bot ID
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

  while (!matchingMessage) {
    const fetched = await modLogs.messages.fetch({
      limit: 100,
      ...(lastId ? { before: lastId } : {}),
    })

    if (fetched.size === 0) break

    for (const msg of fetched.values()) {
      const embed = msg.embeds[0]
      if (!embed) continue

      const botField = embed.fields.find((f) => f.name.toLowerCase() === 'bot')
      if (!botField) continue

      const match = botField.value.match(/\((\d+)\)/)
      if (match && match[1] === disputeID) {
        matchingMessage = msg
        break
      }
    }

    lastId = fetched.last()?.id
  }

  // ...

  if (!matchingMessage) {
    // Create ticket thread even if bot not found
    const embed = new EmbedBuilder()
      .setTitle(`Dispute Ticket for ${interaction.user.username}`)
      .setDescription(
        `${emoji.bot} **Bot ID:** ${disputeID}\n\nPlease provide any additional evidence or reasoning below.`
      )
      .setColor('#ff3366')

    const thread = await modTickets.threads.create({
      name: interaction.user.username,
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

  // Create ticket
  const embed = new EmbedBuilder()
    .setTitle(`Dispute Ticket for ${interaction.user.username}`)
    .setDescription(
      `**See decline here:** ${matchingMessage.url}\n\nPlease provide any additional evidence or reasoning below.`
    )
    .setColor('#ff3366')

  const thread = await modTickets.threads.create({
    name: interaction.user.username,
    type: ChannelType.PrivateThread,
    autoArchiveDuration: 10080,
  })

  let reviewerId = ''
  const logEmbed = matchingMessage.embeds[0]
  if (logEmbed) {
    const reviewerField = logEmbed.fields.find(
      (f) => f.name.toLowerCase() === 'reviewer'
    )
    if (reviewerField) {
      const reviewerMatch = reviewerField.value.match(/<@!?(\d+)>/)
      if (reviewerMatch && reviewerMatch[1]) {
        const potentialReviewerId = reviewerMatch[1]

        // Check if the user still exists and has the reviewer role
        try {
          const reviewerMember = await interaction.guild.members.fetch(
            potentialReviewerId
          )
          if (reviewerMember.roles.cache.has('767320282427686932')) {
            reviewerId = potentialReviewerId
          }
        } catch (error) {
          // User doesn't exist or can't be fetched, so no reviewer ID
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
        ? ` <@${reviewerId}> please take a look.`
        : ` <@&${roleIds.reviewerNotifications}> no valid reviewer - please investigate.`
    }`,
    embeds: [embed],
    allowedMentions: {
      users: [interaction.user.id, ...(reviewerId ? [reviewerId] : [])],
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
