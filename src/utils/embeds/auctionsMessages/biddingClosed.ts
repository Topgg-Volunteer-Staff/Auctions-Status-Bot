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

export const biddingClosed = async (): Promise<BaseMessageOptions> => {
  const tomorrow = await getTomorrowYMD_ET()
  const paymentEndsUTC = zonedTimeToUtc(tomorrow.y, tomorrow.m, tomorrow.d, 15, 0, 0, TZ) // 3:00 PM ET
  const unix = Math.floor(paymentEndsUTC.getTime() / 1000)

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(`${emoji.hammer} Auctions have ended!`)
        .setColor('#ff3366')
        .setDescription(
          `If you won any slots, please remember to [pay them here](https://auctions.top.gg/pay) before the payment window ends on ` +
          `<t:${unix}:F> (<t:${unix}:R>)!\n\n` +
          `${emoji.dotred} Unpaid winning bids will result in you losing your slot!\n` +
          `${emoji.dotred} If using the "Automatic Payments" feature, please check it has been paid!\n` +
          `${emoji.dotred} Partial payments do not count as paid impressions!\n` +
          `${emoji.dotred} Open payment requests must be paid in-full for your ads to appear!\n` +
          `${emoji.dotred} Repeated unpaid bids can result in a ban from our platform!\n\n` +
          `:warning: If your payment request is still showing as open despite you having paid it, please contact staff in <#1012032743250595921> with your FastSpring invoice ID starting with \`DBOTSBV••••\`. You can find the invoice ID in the payment confirmation email you received from FastSpring.\n\n` +
          `Please make sure to click "Continue" in the FastSpring popup after paying as shown below! :point_down:\n\n` +
          `Thanks for using Top.gg Auctions! ${emoji.topggthumbsup}`
        )
        .setImage('https://i.imgur.com/iGoGH6U.png')
        .setTimestamp(paymentEndsUTC),
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

/* ----------------- helpers ----------------- */

// Tomorrow’s Y/M/D in Eastern Time (safe parsing + fallback)
async function getTomorrowYMD_ET(): Promise<{ y: number; m: number; d: number }> {
  try {
    const res = await fetch(TIME_API_URL, { method: 'GET', cache: 'no-store' })
    if (!res.ok) throw new Error(`Time API ${res.status}`)
    const data = (await res.json()) as { datetime?: string }
    const iso = data.datetime ?? ''
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T/)
    if (!m) throw new Error('Malformed datetime from time API')
    const today = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
    return addDaysYMD(today, 1)
  } catch {
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
    const today = { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) }
    return addDaysYMD(today, 1)
  }
}

// Add days to a Y/M/D triple (calendar-accurate)
function addDaysYMD(base: { y: number; m: number; d: number }, days: number) {
  const dt = new Date(Date.UTC(base.y, base.m - 1, base.d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

// Convert a wall-clock time in a timezone to the corresponding UTC Date (handles DST)
function zonedTimeToUtc(
  y: number,
  m: number, // 1–12
  d: number,
  hour: number,
  minute = 0,
  second = 0,
  timeZone = TZ
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
