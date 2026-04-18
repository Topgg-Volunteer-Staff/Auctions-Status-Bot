import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  Guild,
  GuildMember,
  InteractionContextType,
  Message,
  MessageFlags,
  PermissionsBitField,
  SlashCommandBuilder,
  TextChannel,
  ThreadAutoArchiveDuration,
  ThreadChannel,
  User,
} from 'discord.js'
import { channelIds, resolvedFlag, roleIds } from '../globals'
import { errorEmbed, successEmbed } from '../utils/embeds'
import {
  removeTicketDmPreference,
  sendDmOnResponsesPrompt,
} from '../utils/tickets/dmOnResponses'
import { removeThread } from '../utils/tickets/trackActivity'

type MigrationTarget = 'auctions' | 'moderator' | 'reviewer'

type MigrationTargetConfig = {
  closeButton: boolean
  color: `#${string}`
  notifyRoleId: string
  notifyRoleMention: string
  threadName: string
  title: string
  description: string
}

export const command = new SlashCommandBuilder()
  .setName('migrate-ticket')
  .setDescription('Move this ticket into the correct support queue')
  .addStringOption((option) =>
    option
      .setName('target')
      .setDescription('Which queue this ticket should be moved to')
      .setRequired(true)
      .addChoices(
        { name: 'Auctions', value: 'auctions' },
        { name: 'Moderator', value: 'moderator' },
        { name: 'Reviewer', value: 'reviewer' }
      )
  )
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('Optional override for the ticket opener')
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName('note')
      .setDescription('Optional note explaining why the ticket was moved')
      .setMaxLength(500)
      .setRequired(false)
  )
  .setContexts(InteractionContextType.Guild)

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return

  const channel = interaction.channel
  if (!channel || channel.type !== ChannelType.PrivateThread) {
    await interaction.reply({
      embeds: [errorEmbed('This command can only be used inside a ticket thread.')],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const sourceThread = channel as ThreadChannel
  if (
    sourceThread.parentId !== channelIds.auctionsTickets &&
    sourceThread.parentId !== channelIds.modTickets
  ) {
    await interaction.reply({
      embeds: [errorEmbed('This thread is not a supported ticket thread.')],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (sourceThread.name.startsWith(resolvedFlag)) {
    await interaction.reply({
      embeds: [errorEmbed('Resolved tickets cannot be migrated.')],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const hasAccess = await hasMigrationAccess(interaction.member, interaction.guild)
  if (!hasAccess) {
    await interaction.reply({
      embeds: [errorEmbed('Only staff members can use this command.')],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const target = interaction.options.getString('target', true) as MigrationTarget
  const note = interaction.options.getString('note')?.trim() || ''

  const opener =
    interaction.options.getUser('user') ??
    (await resolveTicketOpener(sourceThread, interaction.guild))

  if (!opener) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Could not identify ticket opener',
          'Run the command again with the optional user field so the bot knows who should be added to the new ticket.'
        ),
      ],
    })
    return
  }

  const destinationChannelId = getTargetParentChannelId(target)
  const destinationParent =
    ((interaction.guild.channels.cache.get(destinationChannelId) as
      | TextChannel
      | undefined) ??
      ((await interaction.guild.channels
        .fetch(destinationChannelId)
        .catch(() => null)) as TextChannel | null) ??
      undefined)

  if (!destinationParent) {
    await interaction.editReply({
      embeds: [errorEmbed('Destination channel not found.')],
    })
    return
  }

  const targetConfig = getTargetConfig({
    guild: interaction.guild,
    note,
    opener,
    sourceThread,
    target,
  })

  const activeThreads = await destinationParent.threads.fetchActive()
  const existingThread = activeThreads.threads.find(
    (thread) =>
      thread.id !== sourceThread.id &&
      thread.name.toLowerCase() === targetConfig.threadName.toLowerCase()
  )

  if (existingThread) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'A matching ticket already exists',
          `An active ticket already exists in the target queue: <#${existingThread.id}>`
        ),
      ],
    })
    return
  }


  const destinationThread = await destinationParent.threads.create({
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    name: targetConfig.threadName,
    type: ChannelType.PrivateThread,
  })

  await destinationThread.members.add(opener.id).catch(() => void 0)

  const headerComponents = targetConfig.closeButton
    ? [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`closeModTicket_${opener.id}`)
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger)
        ),
      ]
    : []

  await destinationThread.send({
    allowedMentions: {
      parse: [],
      roles: [targetConfig.notifyRoleId],
      users: [opener.id],
    },
    components: headerComponents,
    content: `${targetConfig.notifyRoleMention}, <@${opener.id}>'s ticket was migrated here by <@${interaction.user.id}>.`,
    embeds: [
      new EmbedBuilder()
        .setColor(targetConfig.color)
        .setTitle(targetConfig.title)
        .setDescription(targetConfig.description),
    ],
  })

  await sendDmOnResponsesPrompt(destinationThread, opener.id)



  const moveNotice = new EmbedBuilder()
    .setColor('#ff3366')
    .setTitle('Ticket moved')
    .setDescription(
      [
        `This ticket was moved by <@${interaction.user.id}>.`,
        `Please continue in <#${destinationThread.id}>.`,
        note ? `Staff note: ${note}` : '',
      ]
        .filter((value) => value.length > 0)
        .join('\n\n')
    )

  await sourceThread.send({
    allowedMentions: { parse: [], users: [interaction.user.id] },
    embeds: [moveNotice],
  })

  if (sourceThread.parentId === channelIds.modTickets) {
    await removeThread(sourceThread.id).catch(() => void 0)
  }

  await removeTicketDmPreference(sourceThread.id).catch(() => void 0)

  await sourceThread.setLocked(true, `Ticket migrated by ${interaction.user.tag}`)
  await sourceThread.setArchived(true, `Ticket migrated to ${destinationThread.id}`)

  await interaction.editReply({
    embeds: [
      successEmbed(
        'Ticket migrated',
        `The new ticket is available in <#${destinationThread.id}> and the original thread has been locked.`
      ),
    ],
  })
}

async function hasMigrationAccess(
  member: GuildMember,
  guild: Guild
): Promise<boolean> {
  const freshMember = await guild.members
    .fetch({ force: true, user: member.id })
    .catch(() => null)

  const roleIdsOnMember = new Set<string>([
    ...member.roles.cache.keys(),
    ...(freshMember ? freshMember.roles.cache.keys() : []),
  ])

  if (member.permissions.has(PermissionsBitField.Flags.ManageThreads)) {
    return true
  }

  return [
    roleIds.moderator,
    roleIds.reviewer,
    roleIds.trialReviewer,
    roleIds.supportTeam,
  ].some((roleId) => roleIdsOnMember.has(roleId))
}

function getTargetParentChannelId(target: MigrationTarget): string {
  if (target === 'auctions') {
    return channelIds.auctionsTickets
  }

  return channelIds.modTickets
}

function getTargetConfig(args: {
  guild: Guild
  note: string
  opener: User
  sourceThread: ThreadChannel
  target: MigrationTarget
}): MigrationTargetConfig {
  const linkLine = `This ticket was migrated from <#${args.sourceThread.id}>.`
  const noteLine = args.note ? `Staff note: ${args.note}` : ''

  if (args.target === 'auctions') {
    const date = new Date()
    const weekendLine =
      date.getDay() === 6 || date.getDay() === 0
        ? 'Weekend support is limited, so replies may take longer than usual.'
        : 'A Support Team member will be with you as soon as possible.'

    return {
      closeButton: false,
      color: '#ff3366',
      description: [
        `${linkLine}`,
        'If your issue is related to payments you have made, include your FastSpring order ID starting with `DBOTSBV` when relevant.',
        weekendLine,
        noteLine,
      ]
        .filter((value) => value.length > 0)
        .join('\n\n'),
      notifyRoleId: roleIds.supportTeam,
      notifyRoleMention: `<@&${roleIds.supportTeam}>`,
      threadName: args.opener.username,
      title: `Private Auctions Support Thread for ${args.opener.username}`,
    }
  }

  if (args.target === 'reviewer') {
    const reviewerPingRoleId = args.guild.roles.cache.has(roleIds.reviewerNotifications)
      ? roleIds.reviewerNotifications
      : roleIds.reviewer

    return {
      closeButton: true,
      color: '#ff6b00',
      description: [
        linkLine,
        'A reviewer will take a look as soon as possible. Please keep any follow-up details in this thread.',
        noteLine,
      ]
        .filter((value) => value.length > 0)
        .join('\n\n'),
      notifyRoleId: reviewerPingRoleId,
      notifyRoleMention: `<@&${reviewerPingRoleId}>`,
      threadName: `Reviewer - ${args.opener.username}`,
      title: `Reviewer Support for ${args.opener.username}`,
    }
  }

  return {
    closeButton: true,
    color: '#ff3366',
    description: [
      linkLine,
      'A moderator will respond as soon as possible. Please keep all relevant context in this thread.',
      noteLine,
    ]
      .filter((value) => value.length > 0)
      .join('\n\n'),
    notifyRoleId: roleIds.modNotifications,
    notifyRoleMention: `<@&${roleIds.modNotifications}>`,
    threadName: `Ticket - ${args.opener.username}`,
    title: `Moderator Support for ${args.opener.username}`,
  }
}

async function resolveTicketOpener(
  thread: ThreadChannel,
  guild: Guild
): Promise<User | null> {
  const threadMembers = await thread.members.fetch().catch(() => null)

  if (threadMembers) {
    for (const threadMember of threadMembers.values()) {
      if (threadMember.id === guild.client.user?.id) {
        continue
      }

      const guildMember = await guild.members.fetch(threadMember.id).catch(() => null)
      if (!guildMember || guildMember.user.bot) {
        continue
      }

      if (!memberHasStaffRole(guildMember)) {
        return guildMember.user
      }
    }
  }

  const messages = await fetchRecentMessages(thread, 10)

  for (const message of messages) {
    const userIdFromButton = findOpenerIdInComponents(message)
    if (userIdFromButton) {
      const fetchedUser = await guild.client.users.fetch(userIdFromButton).catch(() => null)
      if (fetchedUser) return fetchedUser
    }

    const userIdFromContent = findFirstUserMention(message.content)
    if (userIdFromContent) {
      const fetchedUser = await guild.client.users.fetch(userIdFromContent).catch(() => null)
      if (fetchedUser) return fetchedUser
    }
  }

  return null
}

function memberHasStaffRole(member: GuildMember): boolean {
  return [
    roleIds.moderator,
    roleIds.reviewer,
    roleIds.trialReviewer,
    roleIds.supportTeam,
  ].some((roleId) => member.roles.cache.has(roleId))
}

function findOpenerIdInComponents(message: Message): string | null {
  for (const row of message.components) {
    if (!('components' in row) || !Array.isArray(row.components)) {
      continue
    }

    for (const component of row.components) {
      if ('customId' in component && typeof component.customId === 'string') {
        const match = component.customId.match(/^closeModTicket_(\d+)$/)
        if (match?.[1]) {
          return match[1]
        }
      }
    }
  }

  return null
}

function findFirstUserMention(content: string): string | null {
  const matches = Array.from(content.matchAll(/<@!?(\d+)>/g))
  return matches[0]?.[1] ?? null
}

async function fetchRecentMessages(
  thread: ThreadChannel,
  limit: number
): Promise<Array<Message>> {
  const fetchedMessages: Array<Message> = []
  let before: string | undefined

  while (fetchedMessages.length < limit) {
    const batch = await thread.messages.fetch({
      limit: Math.min(100, limit - fetchedMessages.length),
      ...(before ? { before } : {}),
    })

    if (batch.size === 0) break

    const values = Array.from(batch.values())
    fetchedMessages.push(...values)
    before = values.at(-1)?.id

    if (batch.size < 100) break
  }

  return fetchedMessages
    .filter((message) => !message.system)
    .sort((left, right) => left.createdTimestamp - right.createdTimestamp)
}