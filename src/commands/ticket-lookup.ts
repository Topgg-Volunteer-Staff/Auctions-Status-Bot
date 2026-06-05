import {
  ChatInputCommandInteraction,
  Client,
  InteractionContextType,
  Message,
  MessageFlags,
  SlashCommandBuilder,
  TextChannel,
  ThreadChannel,
  type Guild,
  type GuildMember,
  type User,
} from 'discord.js'
import { channelIds, resolvedFlag, roleIds } from '../globals'
import { errorEmbed, successEmbed } from '../utils/embeds'
import { isStaffReminderEligibleInteraction } from '../utils/tickets/staffTicketReminders'

type TicketCategory = 'Mod' | 'Reviewer' | 'Auctions'

type TicketLookupMatch = {
  category: TicketCategory
  thread: ThreadChannel
}

const discordEpochMs = 1420070400000
const archivedPageSize = 100
const explicitSignalPageLimit = 10
const staffRoleIds = [
  roleIds.moderator,
  roleIds.reviewer,
  roleIds.trialReviewer,
  roleIds.supportTeam,
]

export const command = new SlashCommandBuilder()
  .setName('ticket-lookup')
  .setDescription('Show all tickets opened by a selected user')
  .setContexts(InteractionContextType.Guild)
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('The user whose tickets should be listed')
      .setRequired(true)
  )

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      embeds: [
        errorEmbed('Server only', 'This command can only be used in a server.'),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (!(await isStaffReminderEligibleInteraction(interaction))) {
    await interaction.reply({
      embeds: [errorEmbed('Missing permissions', 'Only staff members can use this command.')],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const targetUser = interaction.options.getUser('user', true)
  const tickets = await findTicketsOpenedByUser(interaction.guild, targetUser.id)

  if (tickets.length === 0) {
    await interaction.editReply({
      embeds: [
        successEmbed(
          'No tickets found',
          `I could not find any mod, reviewer, or auctions tickets opened by ${targetUser}.`
        ),
      ],
    })
    return
  }

  await interaction.editReply({
    embeds: buildLookupEmbeds(targetUser, tickets),
  })
}

async function findTicketsOpenedByUser(
  guild: Guild,
  userId: string
): Promise<Array<TicketLookupMatch>> {
  const ticketThreads = await fetchAllTicketThreads(guild)
  const matches: Array<TicketLookupMatch> = []

  for (const ticket of ticketThreads) {
    if (await threadWasOpenedByUser(ticket.thread, guild, userId)) {
      matches.push(ticket)
    }
  }

  matches.sort(
    (left, right) =>
      (threadOpenedUnixSeconds(right.thread) ?? 0) -
      (threadOpenedUnixSeconds(left.thread) ?? 0)
  )

  return matches
}

async function fetchAllTicketThreads(
  guild: Guild
): Promise<Array<TicketLookupMatch>> {
  const [modParent, auctionsParent] = await Promise.all([
    guild.channels.fetch(channelIds.modTickets).catch(() => null),
    guild.channels.fetch(channelIds.auctionsTickets).catch(() => null),
  ])

  const [modThreads, auctionsThreads] = await Promise.all([
    modParent instanceof TextChannel ? fetchThreadsFromChannel(modParent) : [],
    auctionsParent instanceof TextChannel
      ? fetchThreadsFromChannel(auctionsParent)
      : [],
  ])

  return [
    ...modThreads.map((thread) => ({
      thread,
      category: getModTicketCategory(thread),
    })),
    ...auctionsThreads.map((thread) => ({
      thread,
      category: 'Auctions' as const,
    })),
  ]
}

async function fetchThreadsFromChannel(
  channel: TextChannel
): Promise<Array<ThreadChannel>> {
  const threads = new Map<string, ThreadChannel>()

  const active = await channel.threads.fetchActive().catch(() => null)
  if (active) {
    for (const thread of active.threads.values()) {
      threads.set(thread.id, thread)
    }
  }

  let before: string | undefined

  while (true) {
    const archived = await channel.threads
      .fetchArchived({
        limit: archivedPageSize,
        ...(before ? { before } : {}),
      })
      .catch(() => null)

    if (!archived || archived.threads.size === 0) {
      break
    }

    const pageThreads = Array.from(archived.threads.values())
    let addedCount = 0

    for (const thread of pageThreads) {
      if (!threads.has(thread.id)) {
        addedCount += 1
      }
      threads.set(thread.id, thread)
    }

    if (pageThreads.length < archivedPageSize || addedCount === 0) {
      break
    }

    const oldestThread = pageThreads[pageThreads.length - 1]
    if (!oldestThread || oldestThread.id === before) {
      break
    }

    before = oldestThread.id
  }

  return Array.from(threads.values())
}

async function threadWasOpenedByUser(
  thread: ThreadChannel,
  guild: Guild,
  userId: string
): Promise<boolean> {
  const participantIds = await getNonStaffParticipantIds(thread, guild)

  if (participantIds.size === 1) {
    return participantIds.has(userId)
  }

  if (participantIds.size > 1 && !participantIds.has(userId)) {
    return false
  }

  const explicitOpenerId = await findExplicitOpenerId(thread)
  if (explicitOpenerId) {
    return explicitOpenerId === userId
  }

  return false
}

async function getNonStaffParticipantIds(
  thread: ThreadChannel,
  guild: Guild
): Promise<Set<string>> {
  const participantIds = new Set<string>()
  const threadMembers = await thread.members.fetch().catch(() => null)

  if (!threadMembers) {
    return participantIds
  }

  for (const threadMember of threadMembers.values()) {
    if (threadMember.id === guild.client.user?.id) {
      continue
    }

    const member = await guild.members.fetch(threadMember.id).catch(() => null)
    if (!member || member.user.bot || memberHasStaffRole(member)) {
      continue
    }

    participantIds.add(member.id)
  }

  return participantIds
}

function memberHasStaffRole(member: GuildMember): boolean {
  return staffRoleIds.some((roleId) => member.roles.cache.has(roleId))
}

async function findExplicitOpenerId(
  thread: ThreadChannel
): Promise<string | null> {
  let before: string | undefined

  for (let page = 0; page < explicitSignalPageLimit; page++) {
    const messages = await thread.messages
      .fetch({
        limit: archivedPageSize,
        ...(before ? { before } : {}),
      })
      .catch(() => null)

    if (!messages || messages.size === 0) {
      break
    }

    for (const message of messages.values()) {
      const openerIdFromComponents = findOpenerIdInComponents(message)
      if (openerIdFromComponents) {
        return openerIdFromComponents
      }

      const openerIdFromTicketNotification = findOpenerIdInTicketNotification(
        message,
        thread.client.user?.id
      )
      if (openerIdFromTicketNotification) {
        return openerIdFromTicketNotification
      }

      const openerIdFromDmPrompt = findOpenerIdInDmPrompt(
        message,
        thread.client.user?.id
      )
      if (openerIdFromDmPrompt) {
        return openerIdFromDmPrompt
      }
    }

    before = messages.last()?.id
    if (!before || messages.size < archivedPageSize) {
      break
    }
  }

  return null
}

function findOpenerIdInComponents(message: Message): string | null {
  for (const row of message.components) {
    if (!('components' in row) || !Array.isArray(row.components)) {
      continue
    }

    for (const component of row.components) {
      if (!('customId' in component) || typeof component.customId !== 'string') {
        continue
      }

      const match = component.customId.match(
        /^(?:closeModTicket|dmOnResponses)_(\d+)$/
      )
      if (match?.[1]) {
        return match[1]
      }
    }
  }

  return null
}

function findOpenerIdInTicketNotification(
  message: Message,
  clientUserId: string | undefined
): string | null {
  if (message.author.id !== clientUserId) {
    return null
  }

  if (
    !message.content.includes('has created a ticket') &&
    !message.content.includes('has created an Auctions ticket') &&
    !message.content.includes('would like to talk to you')
  ) {
    return null
  }

  return findFirstUserMention(message.content)
}

function findOpenerIdInDmPrompt(
  message: Message,
  clientUserId: string | undefined
): string | null {
  if (message.author.id !== clientUserId) {
    return null
  }

  for (const embed of message.embeds) {
    if (embed.title !== 'Ticket Response Notifications' || !embed.description) {
      continue
    }

    const openerId = findFirstUserMention(embed.description)
    if (openerId) {
      return openerId
    }
  }

  return null
}

function findFirstUserMention(content: string): string | null {
  const matches = Array.from(content.matchAll(/<@!?(\d+)>/g))
  return matches[0]?.[1] ?? null
}

function getModTicketCategory(thread: ThreadChannel): TicketCategory {
  const normalizedName = normalizeName(thread.name)
  const normalizedResolvedFlag = normalizeName(resolvedFlag)
  const baseName = normalizedName.startsWith(normalizedResolvedFlag)
    ? normalizedName.slice(normalizedResolvedFlag.length).trim()
    : normalizedName

  return baseName.startsWith('dispute-') ? 'Reviewer' : 'Mod'
}

function normalizeName(name: string): string {
  return name
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[–—−]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .trim()
    .toLowerCase()
}

function buildLookupEmbeds(
  targetUser: User,
  tickets: Array<TicketLookupMatch>
) {
  const lines = tickets.map(
    ({ category, thread }) =>
      `- [${category}] <#${thread.id}> (${thread.name}) - ${formatOpened(thread)}`
  )

  const descriptionPages = chunkLines(lines, 3800)

  return descriptionPages.map((description, index) => {
    const prefix =
      index === 0
        ? `Found ${tickets.length} ticket${tickets.length === 1 ? '' : 's'} for ${targetUser}.\n\n`
        : ''

    return successEmbed(
      index === 0 ? `Tickets for ${targetUser.username}` : 'More tickets',
      `${prefix}${description}`
    ).setFooter({
      text: `Page ${index + 1} of ${descriptionPages.length}`,
    })
  })
}

function chunkLines(lines: Array<string>, maxLength: number): Array<string> {
  const pages: Array<string> = []
  let current = ''

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line
    if (next.length > maxLength && current) {
      pages.push(current)
      current = line
      continue
    }

    current = next
  }

  if (current) {
    pages.push(current)
  }

  return pages
}

function formatOpened(thread: ThreadChannel): string {
  const openedAt = threadOpenedUnixSeconds(thread)
  if (!openedAt) {
    return 'opened at an unknown time'
  }

  return `opened <t:${openedAt}:f> (<t:${openedAt}:R>)`
}

function threadOpenedUnixSeconds(thread: ThreadChannel): number | null {
  const createdMs = thread.createdTimestamp
  if (
    typeof createdMs === 'number' &&
    Number.isFinite(createdMs) &&
    createdMs > 0
  ) {
    return Math.floor(createdMs / 1000)
  }

  return snowflakeToUnixSeconds(thread.id)
}

function snowflakeToUnixSeconds(id: string): number | null {
  try {
    const ms = Number((BigInt(id) >> 22n) + BigInt(discordEpochMs))
    if (!Number.isFinite(ms) || ms <= 0) {
      return null
    }

    return Math.floor(ms / 1000)
  } catch {
    return null
  }
}