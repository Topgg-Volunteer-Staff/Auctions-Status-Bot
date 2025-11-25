// src/scheduler/startReminders.ts
import { Client } from 'discord.js'
import cron from 'node-cron'
import { runAuctionsMessage } from '../auctions/auctionsMessages'

export default function startReminders(client: Client) {
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
    // '0 1 20 * * Tue',
    '* * * * *',
    () =>
      runAuctionsMessage(client, 'ads-now-live', {
        ping: false,
        crosspost: true,
      }).catch(console.error),
    { timezone: 'Etc/UTC' }
  )
}
