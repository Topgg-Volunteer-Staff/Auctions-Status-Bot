import { Client, ContainerBuilder, ThreadChannel } from 'discord.js'

import { channelIds } from '../../globals'
import { COMPONENTS_V2_FLAGS, createSuccessPanel } from '../componentsV2'
import { saveTranscript } from '../db/transcripts'
import { emoji } from '../emojis'
import { sendErrorLog } from '../errorLogging'
import { getTranscriptUrl } from '../webServer'
import { removeTicketDmPreference } from './dmOnResponses'
import { generateTranscript } from './generateTranscript'
import { getResolvedThreadName } from './resolvedThreadName'
import { recordResolvedTicketCredit } from './resolvedTicketCredit'
import {
  collectTicketParticipantIds,
  createTranscriptPanel,
  sendTranscriptDm,
} from './sendTranscript'
import { removeThreadStaffTicketReminderPreferences } from './staffTicketReminders'
import { removeThread } from './trackActivity'

export type ResolveTicketOptions = {
  client: Client
  thread: ThreadChannel
  parentId: string
  resolvedByUserId: string
  resolvedAt: Date
  /** Command name used for error-log context, e.g. `resolve`. */
  command: string
  /** Posts the "Ticket resolved!" panel — a command reply or a thread message. */
  announce: (components: Array<ContainerBuilder>) => Promise<unknown>
}

const buildResolvedPanel = (parentId: string): ContainerBuilder => {
  let resolveString =
    'If your issue persists or if you need help with a different issue, please open a new ticket in'

  if (parentId === channelIds.auctionsTickets) {
    resolveString += ` <#${channelIds.auctionsTickets}>!\n\nThank you for using Top.gg Auctions! ${emoji.dogThumbUp}`
  } else {
    resolveString += ` <#${channelIds.modTickets}>!\n\nThank you for contacting our staff! ${emoji.dogThumbUp}`
  }

  return createSuccessPanel('Ticket resolved!', resolveString)
}

// Finds the ticket opener: the user mentioned in the creation message, falling
// back to the second non-bot author in case staff spoke first.
const findThreadOwnerId = async (
  client: Client,
  thread: ThreadChannel
): Promise<string | null> => {
  let before: string | undefined

  for (;;) {
    const messages = await thread.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    })

    if (messages.size === 0) break

    const messagesWithMentions = Array.from(messages.values()).filter(
      (m) => m.mentions.users.size > 0
    )

    const creationMsg = messagesWithMentions[messagesWithMentions.length - 1]
    if (creationMsg) {
      const mentionedUser = creationMsg.mentions.users.find(
        (u) => !u.bot && u.id !== client.user?.id
      )
      if (mentionedUser) return mentionedUser.id
    }

    if (messages.size < 100) break
    before = messages.last()?.id
  }

  let fallbackBefore: string | undefined
  let nonBotCount = 0

  for (;;) {
    const messages = await thread.messages.fetch({
      limit: 100,
      ...(fallbackBefore ? { before: fallbackBefore } : {}),
    })

    if (messages.size === 0) break

    const nonBotMessages = Array.from(messages.values())
      .filter((m) => !m.author.bot && m.author.id !== client.user?.id)
      .reverse()

    for (const msg of nonBotMessages) {
      nonBotCount++
      if (nonBotCount === 2) return msg.author.id
    }

    if (messages.size < 100) break
    fallbackBefore = messages.last()?.id
  }

  return null
}

export const resolveTicket = async ({
  client,
  thread,
  parentId,
  resolvedByUserId,
  resolvedAt,
  command,
  announce,
}: ResolveTicketOptions): Promise<void> => {
  const originalThreadName = thread.name
  const isModTicket = parentId === channelIds.modTickets

  await thread.setAutoArchiveDuration(1440, 'Ticket resolved!')
  await thread.setName(getResolvedThreadName(thread.name))

  await announce([buildResolvedPanel(parentId)])

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

  const threadOwnerId = await findThreadOwnerId(client, thread)

  // Save transcript to database first to get the ID
  let transcriptId: string | null = null
  if (threadOwnerId) {
    try {
      transcriptId = await saveTranscript({
        threadId: thread.id,
        threadName: originalThreadName,
        userId: threadOwnerId,
        transcriptHtml,
        generatedAt: resolvedAt,
        resolvedAt,
        resolvedBy: resolvedByUserId,
        isModTicket,
      })
    } catch (error) {
      sendErrorLog(client, 'Failed to save transcript to database', error, {
        threadId: thread.id,
        threadName: thread.name,
        userId: threadOwnerId,
      })
    }
  }

  // Send DM with transcript link to everyone who spoke in the ticket
  if (transcriptId) {
    const transcriptUrl = getTranscriptUrl(transcriptId)

    let participantIds: Array<string> = []
    try {
      participantIds = await collectTicketParticipantIds(thread, client.user?.id)
    } catch (error) {
      await sendErrorLog(
        client,
        'Failed to collect ticket participants for transcript DMs',
        error,
        {
          threadId: thread.id,
          threadName: thread.name,
        }
      ).catch(() => void 0)
    }

    // The ticket opener may never have typed in the thread, so make sure they
    // are always on the list.
    const recipientIds = [
      ...new Set(
        threadOwnerId ? [threadOwnerId, ...participantIds] : participantIds
      ),
    ]

    const failedRecipientIds: Array<string> = []

    for (const recipientId of recipientIds) {
      try {
        const userForDm = await client.users.fetch(recipientId)
        const dmResult = await sendTranscriptDm(
          userForDm,
          thread,
          resolvedByUserId,
          transcriptUrl
        )

        if (!dmResult.success) {
          failedRecipientIds.push(recipientId)
          await sendErrorLog(
            client,
            'Failed to send transcript DM',
            dmResult.error || 'Unknown error',
            {
              threadId: thread.id,
              threadName: thread.name,
              userId: recipientId,
            }
          ).catch(() => void 0)
        }
      } catch (error) {
        failedRecipientIds.push(recipientId)
        await sendErrorLog(client, 'Failed to send transcript DM', error, {
          threadId: thread.id,
          threadName: thread.name,
          userId: recipientId,
        }).catch(() => void 0)
      }
    }

    if (failedRecipientIds.length > 0) {
      const mentions = failedRecipientIds.map((id) => `<@${id}>`).join(', ')
      await thread
        .send({
          content: `${mentions}, we could not send you the transcript via DM. This is likely because you have DMs disabled. The transcript has been generated but could not be delivered.`,
          allowedMentions: { parse: ['users'] },
        })
        .catch(() => void 0)
    }
  }

  // Post transcript panel in channel
  await thread
    .send({
      components: [
        createTranscriptPanel({
          threadName: originalThreadName,
          isModTicket,
          resolvedBy: resolvedByUserId,
          resolvedAt,
          ...(transcriptId
            ? { transcriptUrl: getTranscriptUrl(transcriptId) }
            : {}),
        }),
      ],
      flags: COMPONENTS_V2_FLAGS,
      allowedMentions: { parse: [] },
    })
    .catch((error) => {
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

  await removeThreadStaffTicketReminderPreferences(thread.id).catch((error) => {
    console.error(
      `Failed to remove staff reminders for resolved ticket ${thread.id}:`,
      error
    )
  })

  await recordResolvedTicketCredit({
    client,
    command,
    guildId: thread.guild.id,
    parentId,
    resolvedAt,
    resolvedByUserId,
    threadId: thread.id,
    threadName: originalThreadName,
  })

  await removeThread(thread.id)

  if (isModTicket) {
    const fetched = await thread.guild.channels.fetch(thread.id)

    if (!(fetched instanceof ThreadChannel)) {
      throw new Error('Channel is not a thread')
    }

    // Lock the thread (prevents new messages)
    await fetched.setLocked(true, 'Ticket resolved and locked')

    // Wait to let Discord process lock before archive
    await new Promise((res) => setTimeout(res, 750))

    await fetched.setArchived(true, 'Ticket resolved and archived')

    // Double-check and force archive if needed
    const updatedThread = await thread.guild.channels.fetch(fetched.id)
    if (updatedThread instanceof ThreadChannel && !updatedThread.archived) {
      await updatedThread.setArchived(
        true,
        'Force archive after failed first attempt'
      )
    }
  }
}
