import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  BaseMessageOptions,
} from 'discord.js'
import { emoji } from '../../emojis'

/**
 * TODO: rewrite this to make it simpler:
 * - USE UTC
 * - Events
 *  - ADS GO LIVE: 8pm UTC
 *  - BIDDING ENDS: 7pm UTC
 *  - NEW BIDDING STARTS: 8pm UTC
 *  - PAYMENT WINDOW ENDS: 7pm UTC
 *  -
 *  - BID REMOVAL ENDS: 6:50pm UTC
 */

// Main builder
export const adsNowLive = async (): Promise<BaseMessageOptions> => {
  // Use UTC for all event times
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const day = now.getUTCDate()

  // Helper to get unix timestamp for UTC date
  function getUnixUTC(daysFromNow: number, hour: number, minute = 0) {
    const date = new Date(
      Date.UTC(year, month, day + daysFromNow, hour, minute, 0)
    )
    return Math.floor(date.getTime() / 1000)
  }

  // Events
  // Ads run until next Tuesday: 7 days from now, 20:00 UTC
  const adsEndUnix = getUnixUTC(7, 19, 0)
  // Bidding ends next Monday: 6 days from now, 19:00 UTC
  const biddingEndUnix = getUnixUTC(6, 19, 0)

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(`${emoji.rocket} Ads are now live!`)
        .setColor('#ff3366')
        .setDescription(
          `This week's winning auctions bids are starting to go live and will run until ` +
            `<t:${adsEndUnix}:f> (<t:${adsEndUnix}:R>)\n\n` +
            `[Bidding is now open](https://auctions.top.gg) for next week's auctions and will end on ` +
            `<t:${biddingEndUnix}:f> (<t:${biddingEndUnix}:R>)!\n\n` +
            `Thanks for using Top.gg Auctions! ${emoji.dogThumbUp}`
        )
        .setTimestamp(new Date()),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setURL('https://auctions.top.gg/analyze')
          .setStyle(ButtonStyle.Link)
          .setLabel('Analytics')
          .setEmoji('1062691484471660625')
      ),
    ],
  }
}
