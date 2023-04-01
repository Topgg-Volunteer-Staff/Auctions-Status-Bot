import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  BaseMessageOptions,
} from 'discord.js'
import AuctionsTime from '../../times/AuctionsTime'
import { emoji } from '../../emojis'

export const bidReminder: BaseMessageOptions = {
  embeds: [
    new EmbedBuilder()
      .setTitle(`${emoji.hammer} It's time to bid!`)
      .setColor('#ff3366')
      .setDescription(
        `Auctions is ending ${new AuctionsTime().nextBiddingEnd(
          'R'
        )}!\n\nRemember to [place your bid](https://auctions.top.gg/) before ${new AuctionsTime().nextBiddingEnd(
          'F'
        )}!\n\n:warning: If you have open payment requests from past auctions, please remember to pay them before placing a new bid!`
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
