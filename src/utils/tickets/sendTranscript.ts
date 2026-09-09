import {
  User,
  ThreadChannel,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  DiscordAPIError,
  Client,
} from 'discord.js'
import { channelIds } from '../../globals'
import { COMPONENTS_V2_FLAGS } from '../componentsV2'
import { emoji } from '../emojis'

type SendTranscriptResult = {
  success: boolean
  error?: string
}

const MESSAGE_FETCH_PAGE_SIZE = 100

// Everyone who actually typed in the ticket gets the transcript, not just the
// person who opened it. Bots, webhooks and system messages never count.
export const collectTicketParticipantIds = async (
  thread: ThreadChannel,
  botUserId?: string
): Promise<Array<string>> => {
  const participantIds = new Set<string>()
  let before: string | undefined
  let hasMoreMessages = true

  while (hasMoreMessages) {
    const messages = await thread.messages.fetch({
      limit: MESSAGE_FETCH_PAGE_SIZE,
      ...(before ? { before } : {}),
    })
    if (messages.size === 0) break

    for (const message of messages.values()) {
      if (message.author.bot || message.webhookId || message.system) continue
      if (botUserId && message.author.id === botUserId) continue
      participantIds.add(message.author.id)
    }

    before = messages.last()?.id
    hasMoreMessages =
      messages.size === MESSAGE_FETCH_PAGE_SIZE && typeof before === 'string'
  }

  return [...participantIds]
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error instanceof DiscordAPIError && typeof error.message === 'string') {
    return error.message
  }
  return ''
}

function getDiscordErrorCode(error: unknown): number | null {
  if (error instanceof DiscordAPIError) {
    return typeof error.code === 'number' ? error.code : null
  }
  return null
}

async function resolveDmFailureMessage(
  client: Client,
  userId: string,
  error: unknown
): Promise<string> {
  const code = getDiscordErrorCode(error)
  const message = getErrorMessage(error)

  const looksLikeNoMutualGuildIssue =
    code === 50278 || /no mutual guilds/i.test(message)
  if (!looksLikeNoMutualGuildIssue) {
    return 'Failed to send transcript DM'
  }

  const channel = await client.channels.fetch(channelIds.modTickets).catch(() => null)
  if (!channel || !('guild' in channel) || !channel.guild) {
    return 'Failed to send transcript DM (user likely left the server)'
  }

  const member = await channel.guild.members.fetch(userId).catch(() => null)
  if (!member) {
    return 'Failed to send transcript DM (user is no longer in the server)'
  }

  return 'Failed to send transcript DM (likely DMs disabled for this server or bot blocked)'
}

export type TranscriptPanelOptions = {
  threadName: string
  isModTicket: boolean
  resolvedBy: string
  resolvedAt?: Date
  transcriptUrl?: string
}

const MOD_TICKET_DISCLAIMER =
  'Available to you, our Support Associates, our Moderator team, and any reviewer that handled this ticket.'
const AUCTIONS_TICKET_DISCLAIMER =
  'Available to you and the Support Associate that handled this ticket.'

// One panel shared by the DM and the in-thread post so the two never drift.
export const createTranscriptPanel = ({
  threadName,
  isModTicket,
  resolvedBy,
  resolvedAt = new Date(),
  transcriptUrl,
}: TranscriptPanelOptions): ContainerBuilder => {
  const ticketType = isModTicket
    ? `${emoji.bolt} Mod & Disputes`
    : `${emoji.money} Auctions`
  const resolvedTimestamp = Math.floor(resolvedAt.getTime() / 1000)

  const container = new ContainerBuilder()
    .setAccentColor(isModTicket ? 0xff3366 : 0x00cc88)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `## ${emoji.note} Ticket Transcript`,
          `**${threadName}**`,
          '',
          `${ticketType}  •  Resolved by <@${resolvedBy}>  •  <t:${resolvedTimestamp}:R>`,
        ].join('\n')
      )
    )

  if (transcriptUrl) {
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setURL(transcriptUrl)
          .setLabel('Open Transcript')
          .setEmoji({ name: '📋' })
          .setStyle(ButtonStyle.Link)
      )
    )
  }

  return container
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${emoji.lock} ${
          isModTicket ? MOD_TICKET_DISCLAIMER : AUCTIONS_TICKET_DISCLAIMER
        } Let us know if you have any questions or concerns.`
      )
    )
}

export const sendTranscriptDm = async (
  user: User,
  thread: ThreadChannel,
  resolvedBy: string,
  transcriptUrl: string
): Promise<SendTranscriptResult> => {
  try {
    await user.send({
      components: [
        createTranscriptPanel({
          threadName: thread.name,
          isModTicket: thread.parent?.id === channelIds.modTickets,
          resolvedBy,
          transcriptUrl,
        }),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })

    return { success: true }
  } catch (error) {
    const resolvedMessage = await resolveDmFailureMessage(
      user.client,
      user.id,
      error
    ).catch(() => 'Failed to send transcript DM')

    return {
      success: false,
      error: resolvedMessage,
    }
  }
}
