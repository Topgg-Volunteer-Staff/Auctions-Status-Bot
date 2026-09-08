import {
  User,
  ThreadChannel,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  DiscordAPIError,
  Client,
} from 'discord.js'
import { channelIds } from '../../globals'

type SendTranscriptResult = {
  success: boolean
  error?: string
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

export const sendTranscriptDm = async (
  user: User,
  thread: ThreadChannel,
  resolvedBy: string
): Promise<SendTranscriptResult> => {
  try {
    const isModTicket = thread.parent?.id === channelIds.modTickets

    const disclaimerText = isModTicket
      ? 'These transcripts are available to yourself and our Support Associates, as well as our Moderator team and any reviewer that handled your ticket. Let us know if you have any questions or concerns.'
      : 'These transcripts are only available to yourself and the Support Associate that handled your ticket. Let us know if you have any questions or concerns.'

    const transcriptEmbed = new EmbedBuilder()
      .setTitle('📋 Ticket Transcript')
      .setDescription(`**${thread.name}**\n\n${disclaimerText}`)
      .addFields(
        {
          name: 'Ticket Type',
          value: isModTicket ? '🔴 Mod/Dispute' : '🟢 Auctions',
          inline: true,
        },
        {
          name: 'Resolved By',
          value: `<@${resolvedBy}>`,
          inline: true,
        }
      )
      .setColor(isModTicket ? 0xff6b6b : 0x4ecdc4)
      .setTimestamp()

    const transcriptButton = new ButtonBuilder()
      .setCustomId(`transcript_view_${thread.id}`)
      .setLabel('Transcript')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary)

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(transcriptButton)

    await user.send({
      embeds: [transcriptEmbed],
      components: [row],
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
