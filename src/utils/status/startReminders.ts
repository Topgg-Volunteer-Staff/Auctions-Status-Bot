import { Client } from 'discord.js'
import cron from 'node-cron'
import publish from './publish'
import {
  adsNowLive,
  biddingClosed,
  bidReminder,
  bidRemovalsLocked,
  paymentReminder,
} from '../embeds/auctions'

export default function startReminders(client: Client) {
  // Non ping message 18:50 UTC - we're no longer removing bids

  // Every Monday at 18:30 UTC - Remind users to bid
  cron.schedule(
    '0 30 18 * * Mon',
    () => {
      publish(bidReminder, client, true, true)
    },
    {
      timezone: 'Etc/UTC',
    }
  )

  // Every Monday at 18:50 UTC - Bids no longer removed
  cron.schedule(
    '0 50 18 * * Mon',
    () => {
      publish(bidRemovalsLocked, client, false, true)
    },
    {
      timezone: 'Etc/UTC',
    }
  )

  // Every Monday at 19:00 UTC - Remind users to pay
  cron.schedule(
    '0 00 19 * * Mon',
    () => {
      publish(biddingClosed, client, true, true)
    },
    {
      timezone: 'Etc/UTC',
    }
  )

  // Every Tuesday at 17:00 UTC - Remind users to pay
  cron.schedule(
    '0 00 17 * * Tue',
    () => {
      publish(paymentReminder, client, true, true)
    },
    {
      timezone: 'Etc/UTC',
    }
  )

  // Every Tuesday at 20:00 UTC - Announce ads are going live
  cron.schedule(
    '0 01 20 * * Tue',
    () => {
      publish(adsNowLive, client, false, true)
    },
    {
      timezone: 'Etc/UTC',
    }
  )
}
