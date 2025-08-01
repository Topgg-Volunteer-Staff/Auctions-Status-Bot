import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  BaseMessageOptions,
} from 'discord.js'
import { emoji } from '../../emojis'

const getNextUtcDate = (targetDay: number, hourUTC: number) => {
  const now = new Date() // Fresh now per call
  const result = new Date(now)
  const currentDay = now.getUTCDay()

  let daysUntilTarget = targetDay - currentDay
  if (
    daysUntilTarget < 0 ||
    (daysUntilTarget === 0 && now.getUTCHours() >= hourUTC)
  ) {
    daysUntilTarget += 7
  }

  result.setUTCDate(now.getUTCDate() + daysUntilTarget)
  result.setUTCHours(hourUTC, 0, 0, 0)
  return result
}

const adsEndUTC = getNextUtcDate(2, 20) // Tuesday @ 20:00 UTC — ads run until
const biddingEndsUTC = getNextUtcDate(1, 19) // Monday @ 19:00 UTC — bidding ends

export const adsNowLive: BaseMessageOptions = {
  embeds: [
    new EmbedBuilder()
      .setTitle(`${emoji.rocket} Ads are now live!`)
      .setColor('#ff3366')
      .setDescription(
        `This week's winning auctions bids are starting to go live and will run until <t:${Math.floor(
          adsEndUTC.getTime() / 1000
        )}:f> (<t:${Math.floor(adsEndUTC.getTime() / 1000)}:R>)
        
        \n\n[Bidding is now open](https://auctions.top.gg) for next week's auctions and will end on <t:${Math.floor(
          biddingEndsUTC.getTime() / 1000
        )}:f> (<t:${Math.floor(biddingEndsUTC.getTime() / 1000)}:R>)!
        
        \n\nThanks for using Top.gg Auctions! ${emoji.topggthumbsup}`
      ),
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
