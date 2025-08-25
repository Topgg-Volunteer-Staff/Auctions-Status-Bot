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

const registry: Record<AuctionsMessageKey, Builder> = {
  'bid-reminder': bidReminder,
  'bids-locked': bidRemovalsLocked,
  'bidding-closed': biddingClosed,
  'payment-reminder': paymentReminder,
  'ads-now-live': adsNowLive,
}

export async function runAuctionsMessage(
  client: Client,
  key: AuctionsMessageKey,
  opts?: { ping?: boolean; crosspost?: boolean }
) {
  const build = registry[key]
  if (!build) throw new Error(`Unknown auctions message: ${key}`)
  const payload = await build()
  return publish(payload, client, !!opts?.ping, !!opts?.crosspost)
}

export function listAuctionsMessages(): AuctionsMessageKey[] {
  return Object.keys(registry) as AuctionsMessageKey[]
}
