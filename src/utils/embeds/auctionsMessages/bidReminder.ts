import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  BaseMessageOptions,
} from 'discord.js'
import { emoji } from '../../emojis'

const TIME_API_URL = 'https://worldtimeapi.org/api/timezone/America/New_York'

export const bidReminder = async (): Promise<BaseMessageOptions> => {
  const auctionEndUtc = await getAuctionsEndET()

  const unix = Math.floor(auctionEndUtc.getTime() / 1000)
  const endRelative = `<t:${unix}:R>`
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

async function getAuctionsEndET(): Promise<Date> {
  try {
    const res = await fetch(TIME_API_URL, { method: 'GET', cache: 'no-store' })
    if (!res.ok) throw new Error(`Time API ${res.status}`)
    const data: {
      datetime: string
      utc_offset: string 
    } = await res.json()

    // Use the API's local date + its offset to build "today 15:00:00<offset>"
    const [dateOnly] = data.datetime.split('T') // "YYYY-MM-DD"
    const auctionLocalISO = `${dateOnly}T15:00:00${data.utc_offset}`

    return new Date(auctionLocalISO) // correct UTC instant for 3pm ET today
  } catch {
    // Fallback: compute "today 15:00 ET" using Intl if API unavailable
    const TZ = 'America/New_York'
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .reduce<Record<string, string>>((acc, p) => {
        if (p.type !== 'literal') acc[p.type] = p.value
        return acc
      }, {})
    const y = Number(parts.year)
    const m = Number(parts.month)
    const d = Number(parts.day)
    return zonedTimeToUtc(y, m, d, 15, 0, 0, TZ) // 3:00 PM ET
  }
}

// Convert a wall-clock time in a timezone to the corresponding UTC Date
function zonedTimeToUtc(
  y: number,
  m: number, // 1-12
  d: number,
  hour: number,
  minute = 0,
  second = 0,
  timeZone = 'America/New_York'
): Date {
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hour, minute, second))
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(utcGuess).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value
    return acc
  }, {})

  const asIfInTZ = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )
  const offset = asIfInTZ - utcGuess.getTime()
  return new Date(utcGuess.getTime() - offset)
}
