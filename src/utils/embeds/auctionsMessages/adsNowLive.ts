import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  BaseMessageOptions,
} from 'discord.js'
import AuctionsTime from '../../times/AuctionsTime'
import { emoji } from '../../emojis'

export const adsNowLive: BaseMessageOptions = {
  embeds: [
    new EmbedBuilder()
      .setTitle(`${emoji.rocket} Ads are now live!`)
      .setColor('#ff3366')
      .setDescription(
        `This week's winning auctions bids are starting to go live and will run until ${new AuctionsTime().nextPaymentWindowEnd(
          'F'
        )}!\n\n[Bidding is now open](https://auctions.top.gg) for next week's auctions and will end on ${new AuctionsTime().nextBiddingEnd(
          'F'
        )} (${new AuctionsTime().nextBiddingEnd(
          'R'
        )})!\n\nThanks for using Top.gg Auctions! ${emoji.topggthumbsup}`
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
