import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  BaseMessageOptions,
} from 'discord.js'
import { emoji } from '../../emojis'

const nextMonday = new Date()
// checks if today isnt monday
if (nextMonday.getDay() !== 1) {
  nextMonday.setDate(
    nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7)
  )
}
nextMonday.setHours(19)
nextMonday.setMinutes(0)

// checks if today isnt tuesday
const nextTuesday = new Date()
if (nextTuesday.getDay() !== 2) {
  nextTuesday.setDate(
    nextTuesday.getDate() + ((9 - nextTuesday.getDay()) % 7 || 7)
  )
}
nextTuesday.setHours(19)
nextTuesday.setMinutes(0)

export const adsNowLive: BaseMessageOptions = {
  embeds: [
    new EmbedBuilder()
      .setTitle(`${emoji.rocket} Ads are now live!`)
      .setColor('#ff3366')
      .setDescription(
        `This week's winning auctions bids are starting to go live and will run until <t:${Math.floor(
          nextTuesday.getTime() / 1000
        )}:f> (<t:${Math.floor(nextTuesday.getTime() / 1000)}:R>)
        \n\n[Bidding is now open](https://auctions.top.gg) for next week's auctions and will end on<t:${Math.floor(
          nextMonday.getTime() / 1000
        )}:f> (<t:${Math.floor(nextMonday.getTime() / 1000)}:R>)!
        \n\nThanks for using Top.gg Auctions! ${emoji.topggthumbsup}`
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
