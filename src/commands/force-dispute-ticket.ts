import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  TextChannel,
  TextDisplayBuilder,
  ThreadAutoArchiveDuration,
  type GuildMember,
} from 'discord.js'
import { channelIds, roleIds } from '../globals'
import {
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
  createSuccessPanel,
} from '../utils/componentsV2'
import { sendDmOnResponsesPrompt } from '../utils/tickets/dmOnResponses'
import {
  findRecentBotReviewLog,
  resolveDisputeReviewer,
} from '../utils/tickets/disputeReviewLogs'

export const command = new SlashCommandBuilder()
  .setName('force-dispute-ticket')
  .setDescription('Open a dispute ticket for a user without an owner check')
  .setContexts(InteractionContextType.Guild)
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('The user who should own the dispute ticket')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('bot-id')
      .setDescription('The bot ID used to find the assigned reviewer')
      .setMinLength(10)
      .setMaxLength(30)
      .setRequired(true)
  )

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  if (!(await hasReviewerAccess(interaction.member))) {
    await interaction.editReply({
      components: [
        createErrorPanel(
          'No permission',
          'Only reviewers can use this command.'
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const target = interaction.options.getUser('user', true)
  const botId = interaction.options.getString('bot-id', true).trim()

  if (!/^\d+$/.test(botId)) {
    await interaction.editReply({
      components: [
        createErrorPanel(
          'Invalid ID',
          'Please provide a valid numeric bot ID.'
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const targetMember = await interaction.guild.members
    .fetch(target.id)
    .catch(() => null)
  if (!targetMember) {
    await interaction.editReply({
      components: [
        createErrorPanel(
          'User not found',
          'The targeted user must be a member of this server.'
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const modTickets = interaction.client.channels.cache.get(
    channelIds.modTickets
  ) as TextChannel | undefined
  const modLogs = interaction.client.channels.cache.get(channelIds.modlogs) as
    | TextChannel
    | undefined

  if (!modTickets || !modLogs) {
    await interaction.editReply({
      components: [
        createErrorPanel(
          'Channel not found',
          !modTickets
            ? 'Mod tickets channel not found.'
            : 'Mod logs channel not found.'
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const activeThreads = await modTickets.threads.fetchActive()
  const threadNamePrefix = `dispute - ${target.username.toLowerCase()} <>`
  const existingThread = activeThreads.threads.find((thread) =>
    thread.name.toLowerCase().startsWith(threadNamePrefix)
  )

  if (existingThread) {
    await interaction.editReply({
      components: [
        createErrorPanel(
          "Can't open a new dispute",
          `This user already has an open dispute: <#${existingThread.id}>`
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const reviewLogResult = await findRecentBotReviewLog(modLogs, botId)
  if (reviewLogResult.kind === 'approved') {
    await interaction.editReply({
      components: [
        createErrorPanel(
          "Can't open ticket",
          'This bot was approved, so a decline dispute cannot be opened.'
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const matchingMessage =
    reviewLogResult.kind === 'declined' ? reviewLogResult.message : null
  const reviewer = matchingMessage
    ? await resolveDisputeReviewer(interaction.guild, matchingMessage)
    : { mentorId: null, reviewerId: '', reviewerName: 'Unknown' }

  const thread = await modTickets.threads.create({
    name: `Dispute - ${target.username} <> ${reviewer.reviewerName}`,
    type: ChannelType.PrivateThread,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
  })

  const membersToAdd = new Set<string>([
    target.id,
    ...(reviewer.reviewerId ? [reviewer.reviewerId] : []),
    ...(reviewer.mentorId ? [reviewer.mentorId] : []),
  ])
  for (const memberId of membersToAdd) {
    await thread.members.add(memberId)
  }

  const reviewerNotificationsRoleId = interaction.guild.roles.cache.has(
    roleIds.reviewerNotifications
  )
    ? roleIds.reviewerNotifications
    : null
  const reviewerNotification = reviewer.reviewerId
    ? `<@${reviewer.reviewerId}> please take a look.${
        reviewer.mentorId ? ` (Mentor: <@${reviewer.mentorId}>)` : ''
      }`
    : reviewerNotificationsRoleId
    ? `<@&${reviewerNotificationsRoleId}> no valid reviewer was found - please investigate.`
    : 'No valid reviewer was found - reviewers, please investigate.'

  const ticketPanel = new ContainerBuilder()
    .setAccentColor(0xff3366)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `<@${target.id}> has had a dispute opened by <@${interaction.user.id}>. ${reviewerNotification}`
      ),
      new TextDisplayBuilder().setContent(
        `## Dispute ticket - ${target.username}`
      ),
      new TextDisplayBuilder().setContent(
        matchingMessage
          ? `**Bot ID:** ${botId}\n\n**See decline here:** ${matchingMessage.url}\n\nPlease provide any additional evidence or reasoning below.`
          : `**Bot ID:** ${botId}\n\nNo decline log was found for this bot. Please investigate and provide any additional evidence or reasoning below.`
      )
    )

  const mentionedUsers = Array.from(
    new Set<string>([
      target.id,
      interaction.user.id,
      ...(reviewer.reviewerId ? [reviewer.reviewerId] : []),
      ...(reviewer.mentorId ? [reviewer.mentorId] : []),
    ])
  )

  await thread.send({
    components: [ticketPanel],
    flags: COMPONENTS_V2_FLAGS,
    allowedMentions: {
      parse: [],
      users: mentionedUsers,
      roles:
        !reviewer.reviewerId && reviewerNotificationsRoleId
          ? [reviewerNotificationsRoleId]
          : [],
    },
  })

  await sendDmOnResponsesPrompt(thread, target.id)

  if (matchingMessage) {
    const forwardedContent = matchingMessage.content
      .replace(/<@&?\d+>/g, '')
      .trim()

    await thread.send({
      ...(forwardedContent ? { content: forwardedContent } : {}),
      embeds: matchingMessage.embeds,
      files: matchingMessage.attachments.map((attachment) => ({
        attachment: attachment.url,
      })),
      allowedMentions: { parse: [] },
    })
  }

  await interaction.editReply({
    components: [
      createSuccessPanel(
        'Dispute opened',
        `A dispute for <@${target.id}> was created at <#${thread.id}>.`
      ),
    ],
    flags: COMPONENTS_V2_FLAGS,
    allowedMentions: { parse: [] },
  })
}

async function hasReviewerAccess(member: GuildMember): Promise<boolean> {
  const freshMember = await member.guild.members
    .fetch({ user: member.id, force: true })
    .catch(() => null)
  const memberRoleIds = new Set<string>([
    ...member.roles.cache.keys(),
    ...(freshMember ? freshMember.roles.cache.keys() : []),
  ])

  return (
    memberRoleIds.has(roleIds.reviewer) ||
    memberRoleIds.has(roleIds.trialReviewer)
  )
}
