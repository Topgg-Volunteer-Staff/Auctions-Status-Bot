import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  BaseMessageOptions,
} from 'discord.js'
import { emoji } from '../../emojis'

export const biddingClosed = async (): Promise<BaseMessageOptions> => {
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

  // Payment window ends tomorrow at 19:00 UTC (7pm UTC)
  const paymentDeadlineUnix = getUnixUTC(1, 19, 0)

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(`${emoji.hammer} Auctions have ended!`)
        .setColor('#ff3366')
        .setDescription(
          `If you won any slots, please remember to [pay them here](https://auctions.top.gg/pay) before the payment window ends on ` +
            `<t:${paymentDeadlineUnix}:F> (<t:${paymentDeadlineUnix}:R>)!\n\n` +
            `${emoji.dotred} Unpaid winning bids will result in you losing your slot!\n` +
            `${emoji.dotred} If using the "Automatic Payments" feature, please check it has been paid!\n` +
            `${emoji.dotred} Partial payments do not count as paid impressions!\n` +
            `${emoji.dotred} Open payment requests must be paid in-full for your ads to appear!\n` +
            `${emoji.dotred} Repeated unpaid bids can result in a ban from our platform!\n\n` +
            `:warning: If your payment request is still showing as open despite you having paid it, please contact staff in <#1012032743250595921> with your FastSpring invoice ID starting with \`DBOTSBV••••\`. You can find the invoice ID in the payment confirmation email you received from FastSpring.\n\n` +
            `Please make sure to click "Continue" in the FastSpring popup after paying as shown below! :point_down:\n\n` +
            `Thanks for using Top.gg Auctions! ${emoji.dogThumbUp}`
        )
        .setImage('https://i.imgur.com/iGoGH6U.png')
        .setTimestamp(new Date()),
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
}
