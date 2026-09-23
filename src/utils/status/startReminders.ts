// src/scheduler/startReminders.ts
import { Client, TextChannel } from 'discord.js'
import cron from 'node-cron'
import { checkInactiveThreads } from '../tickets/checkInactiveThreads'
import {
  initializeThreadActivity,
  removeThread,
} from '../tickets/trackActivity'
import { channelIds } from '../../globals'
import { getAllOpenTicketThreads } from '../tickets/staffOwnedThreads'
import {
  enqueueLegacyMigrationCheck,
  processLegacyMigrationCleanupBatch,
} from '../tickets/legacyMigrationCleanup'
import { checkVerificationCenterBotReminders } from '../verificationCenter/inactiveBotReminders'

export default function startReminders(client: Client) {
  setTimeout(async () => {
    try {
      const parentChannels = await Promise.all(
        [channelIds.modTickets, channelIds.auctionsTickets].map((parentId) =>
          client.channels.fetch(parentId).catch(() => null)
        )
      )
      const ticketParent = parentChannels.find(
        (channel): channel is TextChannel => channel instanceof TextChannel
      )
      if (!ticketParent) return

      const openTickets = await getAllOpenTicketThreads(ticketParent.guild)
      for (const { thread } of openTickets) {
        if (thread.locked) {
          enqueueLegacyMigrationCheck(thread)
          await removeThread(thread.id).catch(console.error)
          continue
        }

        await initializeThreadActivity(thread).catch(console.error)
      }

      await processLegacyMigrationCleanupBatch()
    } catch (error) {
      console.error('Error initializing thread activity tracking:', error)
    }
  }, 5000)

  setTimeout(() => {
    checkVerificationCenterBotReminders(client).catch(console.error)
  }, 10_000)

  cron.schedule('0 * * * *', () => {
    checkInactiveThreads(client).catch(console.error)
  })

  cron.schedule('0 * * * *', () => {
    checkVerificationCenterBotReminders(client).catch(console.error)
  })

  // Continue the rate-limited legacy migration cleanup in the background.
  cron.schedule('*/15 * * * *', () => {
    processLegacyMigrationCleanupBatch().catch(console.error)
  })
}
