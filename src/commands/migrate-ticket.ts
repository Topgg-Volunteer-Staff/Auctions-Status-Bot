import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  ContainerBuilder,
  Guild,
  GuildMember,
  InteractionContextType,
  Message,
  MessageFlags,
  PermissionsBitField,
  SectionBuilder,
  SlashCommandBuilder,
  TextChannel,
  TextDisplayBuilder,
  ThumbnailBuilder,
  ThreadAutoArchiveDuration,
  ThreadChannel,
  User,
} from 'discord.js'
import { channelIds, resolvedFlag, roleIds } from '../globals'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
  createSuccessPanel,
} from '../utils/componentsV2'
import {
  removeTicketDmPreference,
  sendDmOnResponsesPrompt,
} from '../utils/tickets/dmOnResponses'
import { removeThread } from '../utils/tickets/trackActivity'

type MigrationTarget = 'auctions' | 'moderator' | 'reviewer'

type MigrationTargetConfig = {
  closeButton: boolean
  color: `#${string}`
  intakePrompt: string
  notifyRoleId: string
  notifyRoleMention: string
  queueLabel: string
  responseExpectation: string
  threadName: string
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
      components: [
        createErrorPanel(
          'This command can only be used inside a ticket thread.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const sourceThread = channel as ThreadChannel
  if (
    sourceThread.parentId !== channelIds.auctionsTickets &&
    sourceThread.parentId !== channelIds.modTickets
  ) {
    await interaction.reply({
      components: [
        createErrorPanel('This thread is not a supported ticket thread.'),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  if (sourceThread.name.startsWith(resolvedFlag)) {
    await interaction.reply({
      components: [createErrorPanel('Resolved tickets cannot be migrated.')],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const hasAccess = await hasMigrationAccess(
    interaction.member,
    interaction.guild
  )
  if (!hasAccess) {
    await interaction.reply({
      components: [
        createErrorPanel('Only staff members can use this command.'),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const target = interaction.options.getString(
    'target',
    true
  ) as MigrationTarget
  const note = interaction.options.getString('note')?.trim() || ''

  const opener =
    interaction.options.getUser('user') ??
    (await resolveTicketOpener(sourceThread, interaction.guild))

  if (!opener) {
    await interaction.editReply({
      components: [
        createErrorPanel(
          'Could not identify ticket opener',
          'Run the command again with the optional user field so the bot knows who should be added to the new ticket.'
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const destinationChannelId = getTargetParentChannelId(target)
  const destinationParent =
    (interaction.guild.channels.cache.get(destinationChannelId) as
      | TextChannel
      | undefined) ??
    ((await interaction.guild.channels
      .fetch(destinationChannelId)
      .catch(() => null)) as TextChannel | null) ??
    undefined

  if (!destinationParent) {
    await interaction.editReply({
      components: [createErrorPanel('Destination channel not found.')],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const targetConfig = getTargetConfig({
    guild: interaction.guild,
    opener,
    target,
  })
  const targetColor = Number.parseInt(targetConfig.color.slice(1), 16)

  const activeThreads = await destinationParent.threads.fetchActive()
  const existingThread = activeThreads.threads.find(
    (thread) =>
      thread.id !== sourceThread.id &&
      thread.name.toLowerCase() === targetConfig.threadName.toLowerCase()
  )

  if (existingThread) {
    await interaction.editReply({
      components: [
        createErrorPanel(
          'A matching ticket already exists',
          `An active ticket already exists in the target queue: <#${existingThread.id}>`
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
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

  const migrationPanel = new ContainerBuilder()
    .setAccentColor(targetColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${targetConfig.notifyRoleMention} <@${opener.id}>`
      )
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${targetConfig.queueLabel} Ticket\nThis ticket has been moved into the correct queue so the right team can pick it up without losing context.`
          )
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder().setURL(opener.displayAvatarURL())
        )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          '**Ticket for**',
          `<@${opener.id}>`,
          '',
          '**Moved by**',
          `<@${interaction.user.id}>`,
          '',
          '**Moved from**',
          formatSourceThreadLabel(sourceThread),
          '',
          '**What to include**',
          targetConfig.intakePrompt,
          '',
          '**What happens next**',
          targetConfig.responseExpectation,
        ].join('\n')
      ),
      new TextDisplayBuilder().setContent(
        `-# Keep any follow-up details in this thread. • <t:${Math.floor(
          Date.now() / 1000
        )}:f>`
      )
    )

  if (headerComponents.length > 0) {
    migrationPanel.addActionRowComponents(...headerComponents)
  }

  await destinationThread.send({
    allowedMentions: {
      parse: [],
      roles: [targetConfig.notifyRoleId],
      users: [opener.id],
    },
    components: [migrationPanel],
    flags: COMPONENTS_V2_FLAGS,
  })

  if (note) {
    await sendMigrationStaffNote({
      destinationParent,
      destinationThread,
      note,
      staffAvatarUrl: interaction.member.displayAvatarURL(),
      staffName: interaction.member.displayName,
    })
  }

  await sendDmOnResponsesPrompt(destinationThread, opener.id)

  const moveNoticeFields = [
    '**Moved by**',
    `<@${interaction.user.id}>`,
    '',
    '**New queue**',
    targetConfig.queueLabel,
    ...(note
      ? [
          '',
          '**Staff note**',
          'Posted in the new thread as a separate follow-up.',
        ]
      : []),
  ].join('\n')

  const moveNoticePanel = new ContainerBuilder()
    .setAccentColor(targetColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Ticket moved\nPlease continue in <#${destinationThread.id}>.`
      ),
      new TextDisplayBuilder().setContent(moveNoticeFields),
      new TextDisplayBuilder().setContent(
        `-# <t:${Math.floor(Date.now() / 1000)}:f>`
      )
    )

  await sourceThread.send({
    allowedMentions: { parse: [] },
    components: [moveNoticePanel],
    flags: COMPONENTS_V2_FLAGS,
  })

  if (sourceThread.parentId === channelIds.modTickets) {
    await removeThread(sourceThread.id).catch(() => void 0)
  }

  await removeTicketDmPreference(sourceThread.id).catch(() => void 0)

  await sourceThread.setLocked(
    true,
    `Ticket migrated by ${interaction.user.tag}`
  )
  await sourceThread.setArchived(
    true,
    `Ticket migrated to ${destinationThread.id}`
  )

  await interaction.editReply({
    components: [
      createSuccessPanel(
        'Ticket migrated',
        `The new ticket is available in <#${destinationThread.id}> and the original thread has been locked.`
      ),
    ],
    flags: COMPONENTS_V2_FLAGS,
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
  opener: User
  target: MigrationTarget
}): MigrationTargetConfig {
  if (args.target === 'auctions') {
    const date = new Date()
    const weekendLine =
      date.getDay() === 6 || date.getDay() === 0
        ? 'Weekend support is limited, so replies may take longer than usual.'
        : 'A Support Team member will be with you as soon as possible.'

    return {
      closeButton: false,
      color: '#ff3366',
      intakePrompt:
        'If this is payment-related, include the FastSpring order ID that starts with `DBOTSBV` and any relevant screenshots.',
      notifyRoleId: roleIds.supportTeam,
      notifyRoleMention: `<@&${roleIds.supportTeam}>`,
      queueLabel: 'Auctions Support',
      responseExpectation: weekendLine,
      threadName: args.opener.username,
    }
  }

  if (args.target === 'reviewer') {
    const reviewerPingRoleId = args.guild.roles.cache.has(
      roleIds.reviewerNotifications
    )
      ? roleIds.reviewerNotifications
      : roleIds.reviewer

    return {
      closeButton: true,
      color: '#ff6b00',
      intakePrompt:
        'Keep any follow-up details, screenshots, and relevant links in this thread so the reviewer team has the full context.',
      notifyRoleId: reviewerPingRoleId,
      notifyRoleMention: `<@&${reviewerPingRoleId}>`,
      queueLabel: 'Reviewer Support',
      responseExpectation:
        'A reviewer will take a look as soon as possible and continue the conversation here.',
      threadName: `Reviewer - ${args.opener.username}`,
    }
  }

  return {
    closeButton: true,
    color: '#ff3366',
    intakePrompt:
      'Keep all relevant context, screenshots, and links in this thread so the moderation team can pick up smoothly.',
    notifyRoleId: roleIds.modNotifications,
    notifyRoleMention: `<@&${roleIds.modNotifications}>`,
    queueLabel: 'Moderator Support',
    responseExpectation:
      'A moderator will respond as soon as possible and continue handling the ticket here.',
    threadName: `Ticket - ${args.opener.username}`,
  }
}

function formatSourceThreadLabel(thread: ThreadChannel): string {
  const queueLabel =
    thread.parentId === channelIds.auctionsTickets
      ? 'Auctions queue'
      : thread.parentId === channelIds.modTickets
      ? 'Moderator queue'
      : thread.parent?.name ?? 'Previous queue'

  return `**${thread.name}** in ${queueLabel}`
}

async function sendMigrationStaffNote(args: {
  destinationParent: TextChannel
  destinationThread: ThreadChannel
  note: string
  staffAvatarUrl: string
  staffName: string
}): Promise<void> {
  const noteContent = `**Staff note**\n${args.note}`

  try {
    const webhook = await args.destinationParent.createWebhook({
      avatar: args.staffAvatarUrl,
      name: args.staffName,
    })

    try {
      await webhook.send({
        allowedMentions: { parse: [] },
        content: noteContent,
        threadId: args.destinationThread.id,
      })
    } finally {
      await webhook.delete().catch(() => void 0)
    }

    return
  } catch {
    await args.destinationThread.send({
      allowedMentions: { parse: [] },
      content: `**Staff note from ${args.staffName}**\n${args.note}`,
    })
  }
}

async function resolveTicketOpener(
  thread: ThreadChannel,
  guild: Guild
): Promise<User | null> {
  const threadMembers = await thread.members.fetch().catch(() => null)

  if (threadMembers) {
    for (const threadMember of threadMembers.values()) {
      if (threadMember.id === guild.client.user.id) {
        continue
      }

      const guildMember = await guild.members
        .fetch(threadMember.id)
        .catch(() => null)
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
    const openerId =
      findOpenerIdInComponents(message) ??
      findOpenerIdInV2Text(message) ??
      findFirstUserMention(message.content) ??
      findOpenerIdInLegacyEmbeds(message)

    if (openerId) {
      const fetchedUser = await guild.client.users
        .fetch(openerId)
        .catch(() => null)
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

type ComponentTreeNode = {
  accessory?: unknown
  components?: ReadonlyArray<unknown>
  content?: unknown
  customId?: unknown
  custom_id?: unknown
  data?: {
    accessory?: unknown
    components?: unknown
    content?: unknown
    custom_id?: unknown
  }
}

function* walkComponentTree(
  components: ReadonlyArray<unknown>
): Generator<ComponentTreeNode> {
  for (const component of components) {
    if (typeof component !== 'object' || component === null) {
      continue
    }

    const node = component as ComponentTreeNode
    yield node

    const dataComponents = node.data?.components
    const childComponents = Array.isArray(node.components)
      ? node.components
      : Array.isArray(dataComponents)
      ? dataComponents
      : []

    if (childComponents.length > 0) {
      yield* walkComponentTree(childComponents)
    }

    const accessory = node.accessory ?? node.data?.accessory
    if (accessory) {
      yield* walkComponentTree([accessory])
    }
  }
}

function getComponentCustomId(component: ComponentTreeNode): string | null {
  const customId =
    component.customId ?? component.custom_id ?? component.data?.custom_id
  return typeof customId === 'string' ? customId : null
}

function getComponentText(component: ComponentTreeNode): string | null {
  const content = component.content ?? component.data?.content
  return typeof content === 'string' ? content : null
}

function findOpenerIdInComponents(message: Message): string | null {
  for (const component of walkComponentTree(message.components)) {
    const customId = getComponentCustomId(component)
    if (!customId) continue

    const directMatch = customId.match(
      /^(?:closeModTicket|dmOnResponses)_(\d+)$/
    )
    if (directMatch?.[1]) {
      return directMatch[1]
    }

    const scopedMatch = customId.match(
      /^dmOnResponses(?:Ticket|Global)_(?:enable|disable)_(\d+)$/
    )
    if (scopedMatch?.[1]) {
      return scopedMatch[1]
    }
  }

  return null
}

const ticketNotificationPhrases = [
  'has created a ticket',
  'has created an Auctions ticket',
  'has opened a dispute',
  'would like to talk to you',
]

function getV2TextDisplayContent(message: Message): string {
  return Array.from(walkComponentTree(message.components))
    .map((component) => getComponentText(component))
    .filter((content): content is string => content !== null)
    .join('\n')
}

function findOpenerIdInV2Text(message: Message): string | null {
  const content = getV2TextDisplayContent(message)
  if (!content) return null

  const migrationNotification = content.match(/^<@&\d+>\s+<@!?(\d+)>$/m)
  if (migrationNotification?.[1]) {
    return migrationNotification[1]
  }

  const ticketForSection = content.match(/\*\*Ticket for\*\*\s*\n<@!?(\d+)>/)
  if (ticketForSection?.[1]) {
    return ticketForSection[1]
  }

  if (
    content.includes('Ticket Response Notifications') ||
    ticketNotificationPhrases.some((phrase) => content.includes(phrase))
  ) {
    return findFirstUserMention(content)
  }

  return null
}

function findOpenerIdInLegacyEmbeds(message: Message): string | null {
  for (const embed of message.embeds) {
    const ticketForField = embed.fields.find(
      (field) => field.name === 'Ticket for'
    )
    if (ticketForField) {
      const openerId = findFirstUserMention(ticketForField.value)
      if (openerId) return openerId
    }

    const embedText = [embed.title, embed.description]
      .filter((value): value is string => typeof value === 'string')
      .join('\n')

    if (
      embed.title === 'Ticket Response Notifications' ||
      ticketNotificationPhrases.some((phrase) => embedText.includes(phrase))
    ) {
      const openerId = findFirstUserMention(embedText)
      if (openerId) return openerId
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
