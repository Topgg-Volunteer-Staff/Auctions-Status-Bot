import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  BaseMessageOptions,
} from 'discord.js'
import { emoji } from '../../emojis'

export const paymentReminder = async (): Promise<BaseMessageOptions> => {
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

  // Payment window ends same day at 19:00 UTC (7pm UTC)
  const paymentDeadlineUnix = getUnixUTC(0, 19, 0)

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(`${emoji.hammer} Payment deadline approaching!`)
        .setColor('#ff3366')
        .setDescription(
          `If you won any slots in yesterday's auctions, please remember to [pay them here](https://auctions.top.gg/pay) before the payment window closes on ` +
            `<t:${paymentDeadlineUnix}:F> (<t:${paymentDeadlineUnix}:R>)!`
        )
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
