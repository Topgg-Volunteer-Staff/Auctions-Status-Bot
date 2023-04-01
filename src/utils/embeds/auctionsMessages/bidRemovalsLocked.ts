import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  BaseMessageOptions,
} from 'discord.js'
import AuctionsTime from '../../times/AuctionsTime'
import { emoji } from '../../emojis'

export const bidRemovalsLocked: BaseMessageOptions = {
  embeds: [
    new EmbedBuilder()
      .setTitle(`${emoji.lock} Bid removals are no longer possible!`)
      .setColor('#ff3366')
      .setDescription(
        `Auctions is ending ${new AuctionsTime().nextBiddingEnd(
          'R'
        )}! We can no longer take requests to remove bids!`
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
