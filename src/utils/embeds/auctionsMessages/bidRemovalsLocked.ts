import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  BaseMessageOptions,
} from 'discord.js'
import { emoji } from '../../emojis'

const TIME_API_URL = 'https://worldtimeapi.org/api/timezone/America/New_York'

export const bidRemovalsLocked = async (): Promise<BaseMessageOptions> => {
  const nowET = await getNowET()

  const unix = Math.floor(nowET.getTime() / 1000)
  const nowFull = `<t:${unix}:F>`

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(`${emoji.lock} Bid removals are no longer possible!`)
        .setColor('#ff3366')
        .setDescription(
          `Auctions is ending ${nowFull}! We can no longer take requests to remove bids!`
        )
        .setTimestamp(nowET), // shows the same time in the embed header
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

/** Fetch "now" in ET; fall back to local clock if the API is unreachable. */
async function getNowET(): Promise<Date> {
  try {
    const res = await fetch(TIME_API_URL, { method: 'GET', cache: 'no-store' })
    if (!res.ok) throw new Error(`Time API ${res.status}`)
    const data: { datetime: string } = await res.json()
    // worldtimeapi's datetime includes the correct ET offset; parsing gives the right UTC instant
    return new Date(data.datetime)
  } catch {
    // Fallback: just use current UTC instant (the scheduler fires this at 3pm ET)
    return new Date()
  }
}
