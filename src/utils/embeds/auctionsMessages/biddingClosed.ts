import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  BaseMessageOptions,
} from 'discord.js'
import AuctionsTime from '../../times/AuctionsTime'
import { emoji } from '../../emojis'

export const biddingClosed: BaseMessageOptions = {
  embeds: [
    new EmbedBuilder()
      .setTitle(`${emoji.hammer} Auctions have ended!`)
      .setColor('#ff3366')
      .setDescription(
        `If you won any slots, please remember to [pay them here](https://auctions.top.gg/pay) before the payment window ends on ${new AuctionsTime().nextPaymentWindowEnd(
          'F'
        )} (${new AuctionsTime().nextPaymentWindowEnd('R')})!\n\n${
          emoji.dotred
        } Unpaid winning bids will result in you losing your slot!\n${
          emoji.dotred
        } If using the "Automatic Payments" feature, please check it has been paid!\n${
          emoji.dotred
        } Partial payments do not count as paid impressions!\n${
          emoji.dotred
        } Open payment requests must be paid in-full for your ads to appear!\n${
          emoji.dotred
        } Repeated unpaid bids can result in a ban from our platform!\n\n:warning: If your payment request is still showing as open despite you having paid it, please contact staff in <#1012032743250595921> with your FastSpring invoice ID starting with \`DBOTSBV••••\`. You can find the invoice ID in the payment confirmation email you received from FastSpring.\n\nPlease make sure to click "Continue" in the FastSpring popup after paying as shown below! :point_down:\n\nThanks for using Top.gg Auctions! ${
          emoji.topggthumbsup
        }`
      )
      .setImage('https://i.imgur.com/iGoGH6U.png'),
  ],
  components: [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setURL('https://auctions.top.gg/pay')
        .setStyle(ButtonStyle.Link)
        .setLabel('Pay now')
        .setEmoji('1036241747178684416')
    ),
  ],
}
