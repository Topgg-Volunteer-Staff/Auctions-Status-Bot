import {
  ModalSubmitInteraction,
  Client,
  ChannelType,
  EmbedBuilder,
  TextChannel,
  MessageFlags,
  MessageType,
  type GuildMember,
  type Collection,
  type Attachment,
} from 'discord.js'
import { channelIds, roleIds } from '../globals'
import { errorEmbed, successEmbed } from '../utils/embeds'
import { getMentorIdForTrialReviewer } from '../utils/trialReviewerMentors'

function extractReviewerSearchQuery(value: string): string | null {
  // Typical formats seen in modlogs vary; aim for a short, searchable name.
  // Examples:
  // - "<@123> (top.gg profile)"
  // - "@SomeName (top.gg profile)"
  // - "SomeName (top.gg profile)"
  const cleaned = value
    .replace(/<@!?\d+>/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/top\.gg profile/gi, '')
    .replace(/^@/g, '')
    .trim()

  if (cleaned.length < 2) return null
  // Keep query reasonably small for Discord member search.
  return cleaned.slice(0, 32)
}

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

  // Extract uploaded screenshot files (optional)
  let uploadedFiles: Array<Attachment> = []
  try {
    const files = interaction.fields.getUploadedFiles('disputeScreenshots') as
      | Collection<string, Attachment>
      | undefined
    uploadedFiles = files ? Array.from(files.values()) : []
  } catch {
    uploadedFiles = []
  }

  // Extract selected dispute reason
  let selectedDisputeReason = ''
  try {
    const disputeReasonValues =
      interaction.fields.getStringSelectValues('disputeReason')
    selectedDisputeReason = disputeReasonValues[0] || ''
  } catch {
    selectedDisputeReason = ''
  }

  // Map dispute reason values to readable labels
  const disputeReasonLabels: Record<string, string> = {
    extra_perms: 'Bot needs extra permissions',
    dashboard_setup: 'Bot needs to be setup through dashboard',
    code_grant: 'Bot requires code grant',
    not_clone: 'Not a clone (I added my own features)',
    under_maintenance: 'Bot under maintenance',
    wrongly_reviewed: 'Wrongly reviewed',
    could_not_contact: 'Reviewer could not contact me',
    other: 'Other',
  }

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
    const disputeTitle = selectedDisputeReason
      ? disputeReasonLabels[selectedDisputeReason] || selectedDisputeReason
      : 'Dispute ticket'

    const embed = new EmbedBuilder()
      .setTitle(`${disputeTitle} - ${interaction.user.username}`)
      .setDescription(
        `**Bot ID:** ${disputeID}\n\nPlease provide any additional evidence or reasoning below.`
      )
      .setColor('#ff3366')

    const thread = await modTickets.threads.create({
      name: `Dispute - ${interaction.user.username} <> unknown`,
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

    const disputeReasonText = selectedDisputeReason
      ? `**Dispute Reason:** ${
          disputeReasonLabels[selectedDisputeReason] || selectedDisputeReason
        }\n\n`
      : ''

    const sentMessage = await webhook.send({
      content: `${disputeReasonText}**Additional Details:** ${appealMessage}`,
      threadId: thread.id,
      allowedMentions: { users: [] },
      ...(uploadedFiles.length > 0 && { files: uploadedFiles }),
    })
    await sentMessage.pin()

    // Delete the auto-generated system "pinned a message" notice
    try {
      const recent = await thread.messages.fetch({ limit: 5 })
      const pinNotice = recent.find(
        (m) => m.type === MessageType.ChannelPinnedMessage
      )
      if (pinNotice) {
        await pinNotice.delete().catch(() => void 0)
      }
    } catch {
      // ignore
    }
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

  // Extract reviewer information
  let reviewerId = ''
  let reviewerName = 'Unknown'
  let mentorId: string | null = null

  try {
    const logEmbed = matchingMessage.embeds[0]
    if (logEmbed) {
      const reviewerField = logEmbed.fields.find(
        (f) => f.name.toLowerCase() === 'reviewer'
      )
      if (reviewerField) {
        const mentionMatch = reviewerField.value.match(/<@!?(\d+)>/)
        const idMatch = reviewerField.value.match(/\b(\d{15,22})\b/)

        let reviewerMember: GuildMember | null = null

        const potentialReviewerId = mentionMatch?.[1] ?? idMatch?.[1] ?? null
        if (potentialReviewerId) {
          reviewerMember = await interaction.guild.members
            .fetch(potentialReviewerId)
            .catch(() => null)
        }

        // Fallback: if modlogs doesn't include a mention/id, search by the value text.
        if (!reviewerMember) {
          const query = extractReviewerSearchQuery(reviewerField.value)
          if (query) {
            const matches = (await interaction.guild.members
              // discord.js v14: guild.members.search
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .search({ query, limit: 10 } as any)
              .catch(() => null)) as Collection<string, GuildMember> | null

            if (matches?.size) {
              const candidates = Array.from(matches.values()).filter(
                (m) =>
                  m.roles.cache.has(roleIds.reviewer) ||
                  m.roles.cache.has(roleIds.trialReviewer)
              )
              reviewerMember = candidates[0] ?? null
            }
          }
        }

        if (reviewerMember) {
          const isReviewer = reviewerMember.roles.cache.has(roleIds.reviewer)
          const isTrialReviewer = reviewerMember.roles.cache.has(
            roleIds.trialReviewer
          )

          // Treat either role as a valid "reviewer" for dispute routing.
          if (isReviewer || isTrialReviewer) {
            reviewerId = reviewerMember.id
            reviewerName = reviewerMember.user.username

            if (isTrialReviewer) {
              mentorId = getMentorIdForTrialReviewer(reviewerId)
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching reviewer information:', error)
  }

  // Create ticket when matching message found
  // Create title based on dispute reason
  const disputeTitle =
    selectedDisputeReason && disputeReasonLabels[selectedDisputeReason]
      ? disputeReasonLabels[selectedDisputeReason]
      : 'Dispute ticket'

  const embed = new EmbedBuilder()
    .setTitle(`${disputeTitle} - ${interaction.user.username}`)
    .setDescription(
      `**See decline here:** ${matchingMessage.url}\n\nPlease provide any additional evidence or reasoning below.`
    )
    .setColor('#ff3366')

  const thread = await modTickets.threads.create({
    name: `Dispute - ${interaction.user.username} <> ${reviewerName}`,
    type: ChannelType.PrivateThread,
    autoArchiveDuration: 10080,
  })

  await thread.send({
    content: `<@${interaction.user.id}> has opened a dispute.${
      reviewerId
        ? ` <@${reviewerId}> please take a look.${
            mentorId ? ` (Mentor: <@${mentorId}>)` : ''
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

  // Send bot ID in first message (not pinned) - using the ID from the modal
  await webhook.send({
    content: `**Bot ID:** ${disputeID}`,
    threadId: thread.id,
    allowedMentions: { users: [] },
  })

  // Send dispute reason and additional details in second message
  const disputeReasonText = selectedDisputeReason
    ? `**Dispute Reason:** ${
        disputeReasonLabels[selectedDisputeReason] || selectedDisputeReason
      }\n\n`
    : ''

  const sentMessage = await webhook.send({
    content: `${disputeReasonText}**Additional Details:** ${appealMessage}`,
    threadId: thread.id,
    allowedMentions: { users: [] },
    ...(uploadedFiles.length > 0 ? { files: uploadedFiles } : {}),
  })
  await sentMessage.pin()

  // Delete the auto-generated system "pinned a message" notice
  try {
    const recent = await thread.messages.fetch({ limit: 5 })
    const pinNotice = recent.find(
      (m) => m.type === MessageType.ChannelPinnedMessage
    )
    if (pinNotice) {
      await pinNotice.delete().catch(() => void 0)
    }
  } catch {
    // ignore
  }

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
