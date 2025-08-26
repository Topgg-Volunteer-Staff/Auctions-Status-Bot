import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  BaseMessageOptions,
} from 'discord.js'
import { emoji } from '../../emojis'

const TIME_API_URL = 'https://worldtimeapi.org/api/timezone/America/New_York'
const TZ = 'America/New_York'

export const paymentReminder = async (): Promise<BaseMessageOptions> => {
  const { y, m, d } = await getTodayYMD_ET()
  // "Same day at 3:00 PM ET"
  const deadlineUTC = zonedTimeToUtc(y, m, d, 15, 0, 0, TZ)
  const unix = Math.floor(deadlineUTC.getTime() / 1000)

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(`${emoji.hammer} Payment deadline approaching!`)
        .setColor('#ff3366')
        .setDescription(
          `If you won any slots in yesterday's auctions, please remember to [pay them here](https://auctions.top.gg/pay) before the payment window closes on ` +
            `<t:${unix}:F> (<t:${unix}:R>)!`
        )
        .setTimestamp(deadlineUTC),
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

async function getTodayYMD_ET(): Promise<{ y: number; m: number; d: number }> {
  try {
    const res = await fetch(TIME_API_URL, { method: 'GET', cache: 'no-store' })
    if (!res.ok) throw new Error(`Time API ${res.status}`)

    const data = (await res.json()) as { datetime?: string }
    const iso = data.datetime ?? ''

    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T/)
    if (!match) throw new Error('Malformed time API datetime')

    return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
  } catch {
    // Fallback: derive today in ET via Intl
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .reduce<Record<string, string>>((acc, p) => {
        if (p.type !== 'literal') acc[p.type] = p.value
        return acc
      }, {})
    return {
      y: Number(parts.year),
      m: Number(parts.month),
      d: Number(parts.day),
    }
  }
}

// Convert an ET wall time to the correct UTC instant (DST-safe)
function zonedTimeToUtc(
  y: number,
  m: number, // 1–12
  d: number,
  hour: number,
  minute = 0,
  second = 0,
  timeZone = TZ
): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, hour, minute, second))
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
  const parts = dtf
    .formatToParts(guess)
    .reduce<Record<string, string>>((acc, p) => {
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
  const offset = asIfInTZ - guess.getTime()
  return new Date(guess.getTime() - offset)
}
