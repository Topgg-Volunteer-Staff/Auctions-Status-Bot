import { Client, BaseMessageOptions } from 'discord.js'
import publish from '../status/publish'
import {
  adsNowLive,
  biddingClosed,
  bidReminder,
  bidRemovalsLocked,
  paymentReminder,
} from '../embeds/auctions'

type Builder = () => BaseMessageOptions | Promise<BaseMessageOptions>

export type AuctionsMessageKey =
  | 'bid-reminder'
  | 'bids-locked'
  | 'bidding-closed'
  | 'payment-reminder'
  | 'ads-now-live'

// Exhaustive + correctly typed
const registry = {
  'bid-reminder': bidReminder,
  'bids-locked': bidRemovalsLocked,
  'bidding-closed': biddingClosed,
  'payment-reminder': paymentReminder,
  'ads-now-live': adsNowLive,
} satisfies Record<AuctionsMessageKey, Builder>

export async function runAuctionsMessage(
  client: Client,
  key: AuctionsMessageKey,
  opts?: { ping?: boolean; crosspost?: boolean }
) {
  const { ping = false, crosspost = false } = opts ?? {}
  const payload = await registry[key]() // build is guaranteed to exist
  return publish(payload, client, ping, crosspost)
}

export function listAuctionsMessages(): Array<AuctionsMessageKey> {
  // OK to assert here because `registry` satisfies the Record above
  return Object.keys(registry) as Array<AuctionsMessageKey>
}
