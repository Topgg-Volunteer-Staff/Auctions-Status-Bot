import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageCreateOptions,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js'
import { createTextPanel } from '../../componentsV2'
import { emoji } from '../../emojis'

export const paymentReminder = async (): Promise<MessageCreateOptions> => {
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

  const panel = createTextPanel({
    accentColor: 0xff3366,
    title: `${emoji.hammer} Payment deadline approaching!`,
    description:
      `If you won any slots in yesterday's auctions, please remember to [pay them here](https://auctions.top.gg/pay) before the payment window closes on ` +
      `<t:${paymentDeadlineUnix}:F> (<t:${paymentDeadlineUnix}:R>)!`,
  })
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# <t:${Math.floor(now.getTime() / 1000)}:f>`
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setURL('https://auctions.top.gg/pay')
          .setStyle(ButtonStyle.Link)
          .setLabel('Pay now')
          .setEmoji('1036241747178684416')
      )
    )

  return {
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  }
}
