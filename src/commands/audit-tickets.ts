import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  TextDisplayBuilder,
  type Guild,
} from 'discord.js'
import { roleIds } from '../globals'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
  createTextPanel,
} from '../utils/componentsV2'
import {
  getAllOpenTicketThreads,
  type TicketCategory,
} from '../utils/tickets/staffOwnedThreads'
import { resolveThreadOwnerUserId } from '../utils/tickets/staffTicketReminders'

export const auditTicketsPageButtonName = 'auditTicketsPage'

const AUDIT_COLOR = 0xff3366
const TICKETS_PER_PAGE = 8
const LOOKUP_BATCH_SIZE = 5
const CATEGORY_ORDER: Array<TicketCategory> = ['Mod', 'Auctions', 'Reviewer']

export type OpenTicketAuditEntry = {
  category: TicketCategory
  lastMessageAt: number
  ownerId: string | null
  threadId: string
}

function categoryRank(category: TicketCategory): number {
  return CATEGORY_ORDER.indexOf(category)
}

function clampPageIndex(pageIndex: number, pageCount: number): number {
  return Math.max(0, Math.min(pageIndex, Math.max(0, pageCount - 1)))
}

function formatTicketLine(
  entry: OpenTicketAuditEntry,
  guildId: string
): string {
  const timestamp = Math.floor(entry.lastMessageAt / 1000)
  const owner = entry.ownerId ? `<@${entry.ownerId}>` : '**Unclaimed**'
  const ticketUrl = `https://discord.com/channels/${guildId}/${entry.threadId}`

  return `- <#${entry.threadId}> - Staff: ${owner} - Last message: <t:${timestamp}:f> (<t:${timestamp}:R>) - [Open](${ticketUrl})`
}

export function buildAuditTicketPageDescription(
  entries: Array<OpenTicketAuditEntry>,
  guildId: string
): string {
  const sections: Array<string> = []

  for (const category of CATEGORY_ORDER) {
    const categoryEntries = entries.filter(
      (entry) => entry.category === category
    )
    if (categoryEntries.length === 0) continue

    const heading =
      category === 'Auctions' ? 'Auction Tickets' : `${category} Tickets`
    sections.push(
      `**${heading}**\n${categoryEntries
        .map((entry) => formatTicketLine(entry, guildId))
        .join('\n')}`
    )
  }

  return sections.join('\n\n')
}

export function paginateAuditTicketEntries(
  entries: Array<OpenTicketAuditEntry>
): Array<Array<OpenTicketAuditEntry>> {
  if (entries.length === 0) return [[]]

  const pages: Array<Array<OpenTicketAuditEntry>> = []
  for (let index = 0; index < entries.length; index += TICKETS_PER_PAGE) {
    pages.push(entries.slice(index, index + TICKETS_PER_PAGE))
  }
  return pages
}

export async function getOpenTicketAuditEntries(
  guild: Guild
): Promise<Array<OpenTicketAuditEntry>> {
  const tickets = await getAllOpenTicketThreads(guild)
  const entries: Array<OpenTicketAuditEntry> = []

  for (let index = 0; index < tickets.length; index += LOOKUP_BATCH_SIZE) {
    const batch = tickets.slice(index, index + LOOKUP_BATCH_SIZE)
    const batchEntries = await Promise.all(
      batch.map(async ({ category, thread }) => {
        const [ownerId, messages] = await Promise.all([
          resolveThreadOwnerUserId(thread).catch(() => null),
          thread.messages.fetch({ limit: 1 }).catch(() => null),
        ])
        const lastMessage = messages?.first()

        return {
          category,
          lastMessageAt:
            lastMessage?.createdTimestamp ??
            thread.createdTimestamp ??
            Date.now(),
          ownerId,
          threadId: thread.id,
        }
      })
    )

    entries.push(...batchEntries)
  }

  return entries.sort(
    (left, right) =>
      categoryRank(left.category) - categoryRank(right.category) ||
      left.lastMessageAt - right.lastMessageAt
  )
}

export function buildAuditTicketsPaginationComponents(
  requestingUserId: string,
  pageIndex: number,
  pageCount: number
): Array<ActionRowBuilder<ButtonBuilder>> {
  if (pageCount <= 1) return []

  const safePageIndex = clampPageIndex(pageIndex, pageCount)
  const customId = (targetPage: number): string =>
    `${auditTicketsPageButtonName}_${requestingUserId}_${targetPage + 1}`

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(customId(safePageIndex - 1))
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePageIndex === 0),
      new ButtonBuilder()
        .setCustomId(`${auditTicketsPageButtonName}_indicator`)
        .setLabel(`Page ${safePageIndex + 1}/${pageCount}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(customId(safePageIndex + 1))
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(safePageIndex >= pageCount - 1)
    ),
  ]
}

export function buildAuditTicketsPanel(
  entries: Array<OpenTicketAuditEntry>,
  guildId: string,
  totalTickets: number,
  pageIndex: number,
  pageCount: number
): ContainerBuilder {
  const description =
    entries.length === 0
      ? 'There are no open mod, auction, or reviewer tickets.'
      : buildAuditTicketPageDescription(entries, guildId)
  const footer =
    pageCount > 1
      ? `${totalTickets} open ticket${totalTickets === 1 ? '' : 's'} - Page ${
          pageIndex + 1
        }/${pageCount}`
      : `${totalTickets} open ticket${totalTickets === 1 ? '' : 's'}`

  return createTextPanel({
    accentColor: AUDIT_COLOR,
    title: 'Open Tickets Audit',
    description,
  }).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${footer} - Generated <t:${Math.floor(Date.now() / 1000)}:R>`
    )
  )
}

export const command = new SlashCommandBuilder()
  .setName('audit-tickets')
  .setDescription('Audit all open tickets and their current staff handlers')
  .setContexts(InteractionContextType.Guild)

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'Server only',
          'This command can only be used in a server.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      allowedMentions: { parse: [] },
    })
    return
  }

  if (!interaction.member.roles.cache.has(roleIds.moderator)) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'Missing permissions',
          'Only moderators can use this command.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      allowedMentions: { parse: [] },
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    const entries = await getOpenTicketAuditEntries(interaction.guild)
    const pages = paginateAuditTicketEntries(entries)
    const pageIndex = 0
    const panel = buildAuditTicketsPanel(
      pages[pageIndex] ?? [],
      interaction.guildId,
      entries.length,
      pageIndex,
      pages.length
    )
    const pagination = buildAuditTicketsPaginationComponents(
      interaction.user.id,
      pageIndex,
      pages.length
    )
    if (pagination.length > 0) panel.addActionRowComponents(...pagination)

    await interaction.editReply({
      components: [panel],
      flags: COMPONENTS_V2_FLAGS,
      allowedMentions: { parse: [] },
    })
  } catch (error) {
    console.error('Failed to audit open tickets:', error)
    await interaction.editReply({
      components: [
        createErrorPanel(
          'Ticket audit failed',
          'I could not load the open tickets. Please try again, if issue continues let William know.'
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
      allowedMentions: { parse: [] },
    })
  }
}
