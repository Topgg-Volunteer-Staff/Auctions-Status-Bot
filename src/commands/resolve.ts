import {
  ChannelType,
  Client,
  CommandInteraction,
  SlashCommandBuilder,
  InteractionContextType,
  ThreadChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'

import { channelIds, resolvedFlag } from '../globals'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
  createSuccessPanel,
} from '../utils/componentsV2'
import { emoji } from '../utils/emojis'
import { sendErrorLog } from '../utils/errorLogging'
import { removeTicketDmPreference } from '../utils/tickets/dmOnResponses'
import { recordResolvedTicketCredit } from '../utils/tickets/resolvedTicketCredit'
import { getResolvedThreadName } from '../utils/tickets/resolvedThreadName'
import { removeThreadStaffTicketReminderPreferences } from '../utils/tickets/staffTicketReminders'
import { removeThread } from '../utils/tickets/trackActivity'
import { generateTranscript } from '../utils/tickets/generateTranscript'
import { sendTranscriptDm } from '../utils/tickets/sendTranscript'
import { saveTranscript } from '../utils/db/transcripts'

export const command = new SlashCommandBuilder()
  .setName('resolve')
  .setDescription('Mark this auctions or mod ticket as resolved')
  .setContexts(InteractionContextType.Guild)

export const execute = async (
  client: Client,
  interaction: CommandInteraction
): Promise<void> => {
  const ch = interaction.channel
  if (!ch || ch.type !== ChannelType.PrivateThread) {
    await interaction.reply({
      components: [createErrorPanel('This is not a thread!')],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const thread = ch as ThreadChannel
  const originalThreadName = thread.name

  if (thread.name.startsWith(resolvedFlag)) {
    await interaction.reply({
      components: [createErrorPanel(`This ticket is already resolved!`)],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const parent = thread.parent
  if (
    !parent ||
    (parent.id !== channelIds.auctionsTickets &&
      parent.id !== channelIds.modTickets)
  ) {
    await interaction.reply({
      components: [createErrorPanel(`This thread is not resolvable!`)],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  try {
    await thread.setAutoArchiveDuration(1440, 'Ticket resolved!')
    await thread.setName(getResolvedThreadName(thread.name))

    let resolveString =
      'If your issue persists or if you need help with a different issue, please open a new ticket in'

    if (parent.id === channelIds.auctionsTickets) {
      resolveString += ` <#${channelIds.auctionsTickets}>!\n\nThank you for using Top.gg Auctions! ${emoji.dogThumbUp}`
    } else {
      resolveString += ` <#${channelIds.modTickets}>!\n\nThank you for contacting our staff! ${emoji.dogThumbUp}`
    }

    await interaction.reply({
      components: [createSuccessPanel(`Ticket resolved!`, `${resolveString}`)],
      flags: COMPONENTS_V2_FLAGS,
      allowedMentions: { parse: [] },
    })

    const isModTicket = parent.id === channelIds.modTickets

    // Generate and send transcript
    let transcriptHtml: string
    try {
      transcriptHtml = await generateTranscript(thread)
    } catch (error) {
      await sendErrorLog(client, 'Failed to generate ticket transcript', error, {
        threadId: thread.id,
        threadName: thread.name,
      })
      throw error
    }

    // Get the thread owner by fetching messages and finding the first non-bot author
    let threadOwner: { id: string } | null = null
    let before: string | undefined

    while (!threadOwner) {
      const messages = await thread.messages.fetch({
        limit: 100,
        ...(before ? { before } : {}),
      })

      if (messages.size === 0) break

      const nonBotMessages = Array.from(messages.values()).filter(
        (m) => !m.author.bot && m.author.id !== client.user?.id
      )

      if (nonBotMessages.length > 0) {
        const msg = nonBotMessages[nonBotMessages.length - 1]
        if (msg) {
          threadOwner = { id: msg.author.id }
          break
        }
      }

      if (messages.size < 100) break
      before = messages.last()?.id
    }

    if (threadOwner) {
      try {
        const userForDm = await client.users.fetch(threadOwner.id)
        const dmResult = await sendTranscriptDm(
          userForDm,
          thread,
          transcriptHtml
        )

        if (!dmResult.success) {
          await sendErrorLog(
            client,
            'Failed to send transcript DM',
            dmResult.error || 'Unknown error',
            {
              threadId: thread.id,
              threadName: thread.name,
              userId: threadOwner.id,
            }
          )

          // Notify in channel that DM failed
          await thread.send({
            content: `<@${threadOwner.id}>, we could not send you the transcript via DM. This is likely because you have DMs disabled. The transcript has been generated but could not be delivered.`,
            allowedMentions: { parse: ['users'] },
          }).catch(() => void 0)
        }
      } catch (error) {
        await sendErrorLog(
          client,
          'Failed to fetch user for transcript DM',
          error,
          {
            threadId: thread.id,
            threadName: thread.name,
            userId: threadOwner.id,
          }
        )
      }
    }

    // Save transcript to database
    if (threadOwner) {
      const owner = threadOwner
      await saveTranscript({
        threadId: thread.id,
        threadName: originalThreadName,
        userId: owner.id,
        transcriptHtml,
        generatedAt: interaction.createdAt,
        resolvedAt: interaction.createdAt,
        resolvedBy: interaction.user.id,
        isModTicket,
      }).catch((error) => {
        sendErrorLog(client, 'Failed to save transcript to database', error, {
          threadId: thread.id,
          threadName: thread.name,
          userId: owner.id,
        })
      })
    }

    // Post transcript embed in channel
    const buffer = Buffer.from(transcriptHtml, 'utf-8')
    const fileName = `transcript-${thread.id}.html`

    const transcriptEmbed = new EmbedBuilder()
      .setTitle('📋 Ticket Transcript')
      .setDescription(originalThreadName)
      .addFields(
        {
          name: 'Ticket Type',
          value: isModTicket ? '🔴 Mod/Dispute' : '🟢 Auctions',
          inline: true,
        },
        {
          name: 'Resolved By',
          value: `<@${interaction.user.id}>`,
          inline: true,
        },
        {
          name: 'Resolved At',
          value: `<t:${Math.floor(interaction.createdAt.getTime() / 1000)}:f>`,
          inline: true,
        }
      )
      .setColor(isModTicket ? 0xff6b6b : 0x4ecdc4)
      .setTimestamp()
      .setFooter({ text: 'Transcript saved for record keeping' })

    const downloadButton = new ButtonBuilder()
      .setCustomId(`transcript_download_${thread.id}`)
      .setLabel('Download Full Transcript')
      .setStyle(ButtonStyle.Primary)

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(downloadButton)

    await thread.send({
      embeds: [transcriptEmbed],
      files: [
        {
          attachment: buffer,
          name: fileName,
        },
      ],
      components: [row],
    }).catch((error) => {
      sendErrorLog(client, 'Failed to post transcript in channel', error, {
        threadId: thread.id,
        threadName: thread.name,
      })
    })

    await removeTicketDmPreference(thread.id).catch((error) => {
      console.error(
        `Failed to remove DM preference for resolved ticket ${thread.id}:`,
        error
      )
    })

    await removeThreadStaffTicketReminderPreferences(thread.id).catch(
      (error) => {
        console.error(
          `Failed to remove staff reminders for resolved ticket ${thread.id}:`,
          error
        )
      }
    )

    if (interaction.guild) {
      await recordResolvedTicketCredit({
        client,
        command: 'resolve',
        guildId: interaction.guildId ?? interaction.guild.id,
        parentId: parent.id,
        resolvedAt: interaction.createdAt,
        resolvedByUserId: interaction.user.id,
        threadId: thread.id,
        threadName: originalThreadName,
      })
    }

    await removeThread(thread.id)

    if (!interaction.guild) {
      throw new Error('Guild is not available on this interaction')
    }

    if (isModTicket) {
      const fetched = await interaction.guild.channels.fetch(thread.id)

      if (!(fetched instanceof ThreadChannel)) {
        throw new Error('Channel is not a thread')
      }

      // Lock the thread (prevents new messages)
      await fetched.setLocked(true, 'Ticket resolved and locked')

      // Wait to let Discord process lock before archive
      await new Promise((res) => setTimeout(res, 750))

      await fetched.setArchived(true, 'Ticket resolved and archived')

      // Double-check and force archive if needed
      const updatedThread = await interaction.guild.channels.fetch(fetched.id)
      if (updatedThread instanceof ThreadChannel && !updatedThread.archived) {
        await updatedThread.setArchived(
          true,
          'Force archive after failed first attempt'
        )
      }
    }
  } catch (err) {
    console.error('Failed to resolve ticket:', err)

    // If you already replied, use followUp else reply
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        components: [
          createErrorPanel(`Failed to resolve ticket. Please try again later.`),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
    } else {
      await interaction.reply({
        components: [
          createErrorPanel(`Failed to resolve ticket. Please try again later.`),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
    }
  }
}
