// src/scheduler/startReminders.ts
import { Client, TextChannel } from 'discord.js'
import cron from 'node-cron'
import { runAuctionsMessage } from '../auctions/auctionsMessages'
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

  cron.schedule('0 * * * *', () => {
    checkInactiveThreads(client).catch(console.error)
  })

  // Continue the rate-limited legacy migration cleanup in the background.
  cron.schedule('*/15 * * * *', () => {
    processLegacyMigrationCleanupBatch().catch(console.error)
  })
  // Every Monday at 18:30 UTC - Remind users to bid
  cron.schedule(
    '0 30 18 * * Mon',
    () =>
      runAuctionsMessage(client, 'bid-reminder', {
        ping: true,
        crosspost: true,
      }).catch(console.error),
    { timezone: 'Etc/UTC' }
  )

  // Every Monday at 18:50 UTC - Bids no longer removed
  cron.schedule(
    '0 50 18 * * Mon',
    () =>
      runAuctionsMessage(client, 'bids-locked', {
        ping: false,
        crosspost: true,
      }).catch(console.error),
    { timezone: 'Etc/UTC' }
  )

  // Every Monday at 19:00 UTC - Auctions ended / pay
  cron.schedule(
    '0 0 19 * * Mon',
    () =>
      runAuctionsMessage(client, 'bidding-closed', {
        ping: true,
        crosspost: true,
      }).catch(console.error),
    { timezone: 'Etc/UTC' }
  )

  // Every Tuesday at 17:00 UTC - Payment reminder
  cron.schedule(
    '0 0 17 * * Tue',
    () =>
      runAuctionsMessage(client, 'payment-reminder', {
        ping: true,
        crosspost: true,
      }).catch(console.error),
    { timezone: 'Etc/UTC' }
  )

  // Every Tuesday at 20:01 UTC - Ads live
  cron.schedule(
    '0 1 20 * * Tue',
    () =>
      runAuctionsMessage(client, 'ads-now-live', {
        ping: false,
        crosspost: true,
      }).catch(console.error),
    { timezone: 'Etc/UTC' }
  )
}
