import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  BaseMessageOptions,
} from 'discord.js'
import { emoji } from '../../emojis'

export const bidReminder = (): BaseMessageOptions => {
  // always 19:00 utc
  const auctionEndTime = getAuctionsEndDate()

  const unix = Math.floor(auctionEndTime.getTime() / 1000)
  // "in x minutes"
  const endRelative = `<t:${unix}:R>`
  // full date
  const endFull = `<t:${unix}:F>`

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(`${emoji.hammer} It's time to bid!`)
        .setColor('#ff3366')
        .setDescription(
          `Auctions is ending ${endRelative}!\n\n` +
            `Remember to [place your bid](https://auctions.top.gg/) before ${endFull}!\n\n` +
            `:warning: If you have open payment requests from past auctions, please remember to pay them before placing a new bid!`
        ),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setURL('https://auctions.top.gg/')
          .setStyle(ButtonStyle.Link)
          .setLabel('Bid now!')
          .setEmoji('1026873993011138660')
      ),
    ],
  }
}

function getAuctionsEndDate(): Date {
  const now = new Date()

  // no need to use api to fetch time reliably
  // before the api, we were using: new Date(now) - now is based on the server time, not utc
  // this approach uses native date methods to get the actual utc time reliably (server timezone doesn't affect this and isn't even referenced)
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      19,
      0,
      0,
      0
    )
  )
}
