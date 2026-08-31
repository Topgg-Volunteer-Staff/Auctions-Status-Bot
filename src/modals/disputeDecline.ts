import {
  ModalSubmitInteraction,
  Client,
  ChannelType,
  ContainerBuilder,
  TextChannel,
  MessageFlags,
  MessageType,
  TextDisplayBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Collection,
  type Attachment,
} from 'discord.js'
import { channelIds, roleIds } from '../globals'
import {
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
  createSuccessPanel,
} from '../utils/componentsV2'
import { createCustomAlertContainer } from '../utils/customAlert'
import {
  createDmOnResponsesRow,
  getTicketDmResponsesState,
  registerTicketThread,
  setToggleMessageUrl,
  sendDmOnResponsesPrompt,
} from '../utils/tickets/dmOnResponses'
import {
  findRecentBotReviewLog,
  resolveDisputeReviewer,
} from '../utils/tickets/disputeReviewLogs'
import { sendErrorLog } from '../utils/errorLogging'
import {
  fetchTopggBotOwnership,
  isTopggUserOnBotTeam,
  validateDiscordId,
  type TopggBotTeam,
} from '../utils/topggTeams'

function isSnowflake(value: unknown): value is string {
  return typeof value === 'string' && /^\d{10,30}$/.test(value)
}

function uniqueSnowflakes(values: Array<string>): Array<string> {
  return Array.from(new Set(values))
}

export function extractDisputeOwnerId(content: string): string | null {
  return content.match(/<@!?(\d{10,30})>/)?.[1] ?? null
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

  try {
    disputeID = validateDiscordId(disputeID)
  } catch {
    await interaction.editReply({
      components: [
        createErrorPanel(
          'Invalid ID',
          'Please provide a valid Discord bot ID.'
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const modTickets = interaction.client.channels.cache.get(
    channelIds.modTickets
  ) as TextChannel | undefined
  if (!modTickets) {
    await interaction.editReply({
      components: [createErrorPanel('Error', 'Mod tickets channel not found.')],
      flags: COMPONENTS_V2_FLAGS,
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
      components: [
        createErrorPanel(
          'Can’t open a new dispute!',
          `You already have an open dispute here: <#${existingThread.id}>`
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  // Search modlogs for matching bot ID (only last 2 weeks)
  const modLogs = interaction.client.channels.cache.get(channelIds.modlogs) as
    | TextChannel
    | undefined
  if (!modLogs) {
    await interaction.editReply({
      components: [createErrorPanel('Error', 'Mod logs channel not found.')],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const reviewLogResult = await findRecentBotReviewLog(modLogs, disputeID)
  if (reviewLogResult.kind === 'approved') {
    await interaction.editReply({
      components: [
        createErrorPanel(
          "Can't open ticket",
          `This bot was approved. If you need help with this bot, please ask in <#714045415707770900> or create a mod ticket above.`
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const matchingMessage =
    reviewLogResult.kind === 'declined' ? reviewLogResult.message : null

  // If not found in last 2 weeks
  if (!matchingMessage) {
    const disputeTitle = selectedDisputeReason
      ? disputeReasonLabels[selectedDisputeReason] || selectedDisputeReason
      : 'Dispute ticket'

    const thread = await modTickets.threads.create({
      name: `Dispute - ${interaction.user.username} <> unknown`,
      type: ChannelType.PrivateThread,
      autoArchiveDuration: 10080,
    })

    const reviewerNotificationsRoleId =
      isSnowflake(roleIds.reviewerNotifications) &&
      interaction.guild.roles.cache.has(roleIds.reviewerNotifications)
        ? roleIds.reviewerNotifications
        : null

    const reviewerNotificationsMention = reviewerNotificationsRoleId
      ? `<@&${reviewerNotificationsRoleId}>`
      : 'reviewers'

    const notificationContent = `<@${interaction.user.id}> has opened a dispute. ${reviewerNotificationsMention} no decline log found for this bot - please investigate.`

    const alertContainer = createCustomAlertContainer()
    if (alertContainer) {
      await thread.send({
        components: [alertContainer],
        flags: COMPONENTS_V2_FLAGS,
        allowedMentions: {
          parse: [],
          users: isSnowflake(interaction.user.id) ? [interaction.user.id] : [],
          roles: reviewerNotificationsRoleId ? [reviewerNotificationsRoleId] : [],
        },
      })
    }

    await sendDmOnResponsesPrompt(thread, interaction.user.id)

    const dmState = await getTicketDmResponsesState(
      thread.id,
      interaction.user.id
    )

    const unknownDmStatusText = dmState.enabled ? 'On' : 'Off'

    const unknownBotPanel = new ContainerBuilder()
      .setAccentColor(0xff3366)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(notificationContent),
        new TextDisplayBuilder().setContent(`## ${disputeTitle} - ${interaction.user.username}`),
        new TextDisplayBuilder().setContent(
          [
            '**Bot ID:** `' + disputeID + '`',
            '',
            '-# DM notifications: ' + unknownDmStatusText,
          ].join('\n')
        )
      )
      .addActionRowComponents(
        createDmOnResponsesRow(interaction.user.id, dmState.enabled)
      )
      .addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('staffTools')
            .setLabel('Staff Tools')
            .setStyle(ButtonStyle.Secondary)
        )
      )

    const sent = await thread.send({
      components: [unknownBotPanel],
      flags: COMPONENTS_V2_FLAGS,
      allowedMentions: {
        parse: [],
        users: isSnowflake(interaction.user.id) ? [interaction.user.id] : [],
        roles: reviewerNotificationsRoleId ? [reviewerNotificationsRoleId] : [],
      },
    })

    await setToggleMessageUrl(thread.id, sent.url).catch(() => void 0)

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
      components: [
        createSuccessPanel(
          'Dispute opened!',
          `No decline log was found for bot ID \`${disputeID}\`, but your dispute has been created at <#${thread.id}>.`
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const ownerId = extractDisputeOwnerId(matchingMessage.content)
  const openedByOwner = ownerId === interaction.user.id
  let openedByTeamMember = false
  let topggTeam: TopggBotTeam | null = null

  try {
    const topggOwnership = await fetchTopggBotOwnership(disputeID)
    topggTeam = topggOwnership.team

    if (!openedByOwner) {
      openedByTeamMember = Boolean(
        topggTeam?.members.some(
          (member) => member.user.id === interaction.user.id
        )
      )

      if (!openedByTeamMember) {
        openedByTeamMember = await isTopggUserOnBotTeam(
          interaction.user.id,
          disputeID,
          topggTeam
        )
      }
    }
  } catch (error) {
    void sendErrorLog(
      interaction.client,
      'dispute.topggTeamLookup.failed',
      error,
      {
        botId: disputeID,
        requesterId: interaction.user.id,
      }
    )

    if (!openedByOwner) {
      await interaction.editReply({
        components: [
          createErrorPanel(
            "Can't verify team membership",
            'Top.gg team membership could not be verified right now. Please try again shortly.'
          ),
        ],
        flags: COMPONENTS_V2_FLAGS,
      })
      return
    }
  }

  if (!openedByOwner && !openedByTeamMember) {
    await interaction.editReply({
      components: [
        createErrorPanel(
          "Can't open ticket",
          "Only the bot's owner or a member of its Top.gg team can open a dispute."
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  // Extract reviewer information
  const { reviewerId, reviewerName, mentorId } = await resolveDisputeReviewer(
    interaction.guild,
    matchingMessage
  )

  // Create ticket when matching message found
  // Create title based on dispute reason
  const disputeTitle =
    selectedDisputeReason && disputeReasonLabels[selectedDisputeReason]
      ? disputeReasonLabels[selectedDisputeReason]
      : 'Dispute ticket'

  const thread = await modTickets.threads.create({
    name: `Dispute - ${interaction.user.username} <> ${reviewerName}`,
    type: ChannelType.PrivateThread,
    autoArchiveDuration: 10080,
  })

  const reviewerNotificationsRoleId =
    isSnowflake(roleIds.reviewerNotifications) &&
    interaction.guild.roles.cache.has(roleIds.reviewerNotifications)
      ? roleIds.reviewerNotifications
      : null

  const reviewerNotificationsMention = reviewerNotificationsRoleId
    ? `<@&${reviewerNotificationsRoleId}>`
    : 'reviewers'

  const mentionUserIds = uniqueSnowflakes(
    [interaction.user.id, reviewerId, mentorId ?? ''].filter(isSnowflake)
  )

  const notificationContent = `<@${interaction.user.id}> has opened a dispute.${
    reviewerId
      ? ` <@${reviewerId}> please take a look.${
          mentorId ? ` (Mentor: <@${mentorId}>)` : ''
        }`
      : ` ${reviewerNotificationsMention} no valid reviewer - please investigate.`
  }`
  const openerRelationship = openedByOwner
    ? 'Owner (from the decline log)'
    : 'Top.gg team member'

  const alertContainer = createCustomAlertContainer()

  // Send initial notification
  if (alertContainer) {
    await thread.send({
      components: [alertContainer],
      flags: COMPONENTS_V2_FLAGS,
      allowedMentions: {
        parse: [],
        users: mentionUserIds,
        roles:
          reviewerId || !reviewerNotificationsRoleId
            ? []
            : [reviewerNotificationsRoleId],
      },
    })
  }

  await registerTicketThread(thread.id, interaction.user.id)
  const dmState = await getTicketDmResponsesState(
    thread.id,
    interaction.user.id
  )

  const declineReason =
    matchingMessage.embeds
      .flatMap((embed) => [embed.description, ...embed.fields.map((f) => f.value)])
      .find((text) => text && text.length > 0) || undefined

  // Create a comprehensive panel combining all dispute information
  const dmStatusText = dmState.enabled
    ? 'On'
    : dmState.inheritedDisabled
      ? 'Off (global setting)'
      : 'Off'

  const comprehensivePanel = new ContainerBuilder()
    .setAccentColor(0xff3366)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(notificationContent),
      new TextDisplayBuilder().setContent(`## ${disputeTitle} - ${interaction.user.username}`),
      new TextDisplayBuilder().setContent(
        [
          '**Bot ID:** `' + disputeID + '`',
          '**Opened as:** ' + openerRelationship,
          '',
          '**Reviewer:** ' + reviewerName,
          ...(declineReason ? ['**Reason:** ' + declineReason] : []),
          '[See original decline](' + matchingMessage.url + ')',
          '',
          '-# DM notifications: ' + dmStatusText,
        ].join('\n')
      )
    )
    .addActionRowComponents(
      createDmOnResponsesRow(interaction.user.id, dmState.enabled)
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('staffTools')
          .setLabel('Staff Tools')
          .setStyle(ButtonStyle.Secondary)
      )
    )

  const sent = await thread.send({
    components: [comprehensivePanel],
    flags: COMPONENTS_V2_FLAGS,
    allowedMentions: {
      parse: [],
      users: mentionUserIds,
      roles:
        reviewerId || !reviewerNotificationsRoleId
          ? []
          : [reviewerNotificationsRoleId],
    },
  })

  await setToggleMessageUrl(thread.id, sent.url).catch(() => void 0)

  let forwardContent = matchingMessage.content || ''
  forwardContent = forwardContent.replace(/<@&?\d+>/g, '').trim()

  if (forwardContent || matchingMessage.attachments.size > 0) {
    await thread.send({
      ...(forwardContent && { content: forwardContent }),
      files: Array.from(matchingMessage.attachments.values()).map((att) => ({
        attachment: att.url,
      })),
      allowedMentions: { parse: [] },
    })
  }

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
    components: [
      createSuccessPanel(
        'Dispute opened!',
        `Your dispute has been created at <#${thread.id}>. A reviewer will assist you shortly.`
      ),
    ],
    flags: COMPONENTS_V2_FLAGS,
  })
}
