import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  BaseMessageOptions,
} from 'discord.js'
import { emoji } from '../../emojis'

export const bidRemovalsLocked = (): BaseMessageOptions => {
  // always 19:00 utc
  const auctionEndUtc = getAuctionsEndDate()
  const unix = Math.floor(auctionEndUtc.getTime() / 1000)
  // "in x minutes"
  const endRelative = `<t:${unix}:R>`

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(`${emoji.lock} Bid removals are no longer possible!`)
        .setColor('#ff3366')
        .setDescription(
          `Auctions is ending ${endRelative}! We can no longer take requests to remove bids!`
        )
        .setTimestamp(),
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
