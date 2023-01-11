import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageOptions,
} from 'discord.js'
import AuctionsTime from '../../times/AuctionsTime'
import { emoji } from '../../emojis'

export const paymentReminder: MessageOptions = {
  embeds: [
    new EmbedBuilder()
      .setTitle(`${emoji.hammer} Payment deadline approaching!`)
      .setColor('#ff3366')
      .setDescription(
        `If you won any slots in yesterday's auctions, please remember to [pay them here](https://auctions.top.gg/pay) before the payment window closes on ${new AuctionsTime().nextPaymentWindowEnd(
          'F'
        )} (${new AuctionsTime().nextPaymentWindowEnd('R')})!`
      ),
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
