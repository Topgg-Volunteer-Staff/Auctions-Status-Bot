import {
  ChatInputCommandInteraction,
  Client,
  GuildMember,
  Message,
  MessageFlags,
  SlashCommandBuilder,
  InteractionContextType,
  ThreadChannel,
} from 'discord.js'
import { roleIds } from '../globals'
import { errorEmbed, successEmbed } from '../utils/embeds'
import { isStaffReminderEligibleInteraction } from '../utils/tickets/staffTicketReminders'
import {
  getOpenUnclaimedTickets,
  type TicketThreadMatch,
} from '../utils/tickets/staffOwnedThreads'

type ReviewerTicketReason = 'mentioned you' | 'reviewer ping'

type ReviewerTicketMatch = TicketThreadMatch & {
  reason: ReviewerTicketReason
}

const discordEpochMs = 1420070400000
const messageScanPageLimit = 10
const messagePageSize = 100
const maxTicketsPerSection = 12

export const command = new SlashCommandBuilder()
  .setName('open-tickets')
  .setDescription('Show unclaimed tickets that still need a first staff reply')
  .setContexts(InteractionContextType.Guild)

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
      embeds: [
        errorEmbed('Missing permissions', 'Only staff members can use this command.'),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    const memberRoleIds = await getMemberRoleIds(interaction)
    const hasModPlusAccess =
      memberRoleIds.has(roleIds.moderator) ||
      memberRoleIds.has(roleIds.supportTeam)

    const openTickets = await getOpenUnclaimedTickets(interaction.guild)
    openTickets.sort(
      (left, right) =>
        (threadOpenedUnixSeconds(left.thread) ?? 0) -
        (threadOpenedUnixSeconds(right.thread) ?? 0)
    )

    if (hasModPlusAccess) {
      await replyWithModPlusView(interaction, openTickets)
      return
    }

    const reviewerPingRoleId = interaction.guild.roles.cache.has(
      roleIds.reviewerNotifications
    )
      ? roleIds.reviewerNotifications
      : roleIds.reviewer

    const reviewerTickets = await getReviewerScopedTickets(
      openTickets,
      interaction.user.id,
      reviewerPingRoleId
    )

    await replyWithReviewerView(interaction, reviewerTickets)
  } catch (error) {
    console.error('Error while loading open tickets:', error)
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Open tickets failed',
          'I could not load the current open tickets. Please try again.'
        ),
      ],
    })
  }
}

async function getMemberRoleIds(
  interaction: ChatInputCommandInteraction
): Promise<Set<string>> {
  const cachedMember =
    interaction.member instanceof GuildMember ? interaction.member : null

  const freshMember = await interaction.guild?.members
    .fetch({ user: interaction.user.id, force: true })
    .catch(() => null)

  return new Set<string>([
    ...(cachedMember ? cachedMember.roles.cache.keys() : []),
    ...(freshMember ? freshMember.roles.cache.keys() : []),
  ])
}

async function replyWithModPlusView(
  interaction: ChatInputCommandInteraction,
  tickets: Array<TicketThreadMatch>
): Promise<void> {
  const modTickets = tickets.filter((ticket) => ticket.category === 'Mod')
  const reviewerTickets = tickets.filter(
    (ticket) => ticket.category === 'Reviewer'
  )
  const auctionsTickets = tickets.filter(
    (ticket) => ticket.category === 'Auctions'
  )

  const totalTickets = tickets.length
  if (totalTickets === 0) {
    await interaction.editReply({
      embeds: [
        successEmbed(
          'No open tickets',
          'I could not find any open mod, reviewer, or auctions tickets that still need a first staff reply.'
        ),
      ],
    })
    return
  }

  const description = [
    `Found ${totalTickets} open ticket${totalTickets === 1 ? '' : 's'} with no staff owner yet.`,
    '',
    buildTicketSection('Mod Tickets', modTickets),
    buildTicketSection('Auctions Tickets', auctionsTickets),
    buildTicketSection('Reviewer Tickets', reviewerTickets),
  ].join('\n')

  await interaction.editReply({
    embeds: [successEmbed('Open tickets', description)],
  })
}

async function getReviewerScopedTickets(
  tickets: Array<TicketThreadMatch>,
  userId: string,
  reviewerPingRoleId: string
): Promise<Array<ReviewerTicketMatch>> {
  const scopedTickets: Array<ReviewerTicketMatch> = []

  for (const ticket of tickets) {
    if (ticket.category !== 'Reviewer') {
      continue
    }

    const reason = await getReviewerTicketReason(
      ticket.thread,
      userId,
      reviewerPingRoleId
    )

    if (!reason) {
      continue
    }

    scopedTickets.push({
      ...ticket,
      reason,
    })
  }

  return scopedTickets
}

async function replyWithReviewerView(
  interaction: ChatInputCommandInteraction,
  tickets: Array<ReviewerTicketMatch>
): Promise<void> {
  if (tickets.length === 0) {
    await interaction.editReply({
      embeds: [
        successEmbed(
          'No reviewer tickets',
          'I could not find any open reviewer tickets with no staff replies that mentioned you or pinged the reviewer role.'
        ),
      ],
    })
    return
  }

  const lines = tickets.slice(0, maxTicketsPerSection).map((ticket) => {
    return `- <#${ticket.thread.id}> (${ticket.thread.name}) - ${ticket.reason} - ${formatOpened(ticket.thread)}`
  })

  const moreLine =
    tickets.length > maxTicketsPerSection
      ? `\n...and ${tickets.length - maxTicketsPerSection} more`
      : ''

  await interaction.editReply({
    embeds: [
      successEmbed(
        'Open reviewer tickets',
        [
          `Found ${tickets.length} open reviewer ticket${tickets.length === 1 ? '' : 's'} with no staff owner that either mentioned you or pinged the reviewer role.`,
          '',
          `**Reviewer Tickets (${tickets.length}):**`,
          lines.join('\n') + moreLine,
        ].join('\n')
      ),
    ],
  })
}

function buildTicketSection(
  title: string,
  tickets: Array<TicketThreadMatch>
): string {
  if (tickets.length === 0) {
    return `**${title} (0):**\n- None`
  }

  const lines = tickets.slice(0, maxTicketsPerSection).map((ticket) => {
    return `- <#${ticket.thread.id}> (${ticket.thread.name}) - ${formatOpened(ticket.thread)}`
  })

  const moreLine =
    tickets.length > maxTicketsPerSection
      ? `\n...and ${tickets.length - maxTicketsPerSection} more`
      : ''

  return `**${title} (${tickets.length}):**\n${lines.join('\n')}${moreLine}`
}

async function getReviewerTicketReason(
  thread: ThreadChannel,
  userId: string,
  reviewerPingRoleId: string
): Promise<ReviewerTicketReason | null> {
  const directMention = new RegExp(`<@!?${userId}>`)
  const reviewerRoleMention = `<@&${reviewerPingRoleId}>`
  let before: string | undefined

  for (let page = 0; page < messageScanPageLimit; page++) {
    const messages = await thread.messages
      .fetch({
        limit: messagePageSize,
        ...(before ? { before } : {}),
      })
      .catch(() => null)

    if (!messages || messages.size === 0) {
      break
    }

    for (const message of messages.values()) {
      if (message.author.id !== thread.client.user?.id) {
        continue
      }

      if (isDirectReviewerTicketMessage(message, directMention)) {
        return 'mentioned you'
      }

      if (isReviewerBroadcastTicketMessage(message, reviewerRoleMention)) {
        return 'reviewer ping'
      }
    }

    before = messages.last()?.id
    if (!before || messages.size < messagePageSize) {
      break
    }
  }

  return null
}

function isDirectReviewerTicketMessage(
  message: Message,
  directMention: RegExp
): boolean {
  return (
    message.content.includes('please take a look') &&
    directMention.test(message.content)
  )
}

function isReviewerBroadcastTicketMessage(
  message: Message,
  reviewerRoleMention: string
): boolean {
  return (
    message.content.includes(reviewerRoleMention) ||
    message.content.includes('no valid reviewer - please investigate') ||
    message.content.includes('no decline log found for this bot - please investigate')
  )
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