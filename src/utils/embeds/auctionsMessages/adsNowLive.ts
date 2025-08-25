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

// Main builder
export const adsNowLive = async (): Promise<BaseMessageOptions> => {
  const todayET = await getTodayYMD_ET()

  // Ads run until next Tuesday: exactly 7 days from post, 4:00 PM ET
  const adsEndYMD = addDaysYMD(todayET, 7)
  const adsEndUTC = zonedTimeToUtc(
    adsEndYMD.y,
    adsEndYMD.m,
    adsEndYMD.d,
    16,
    0,
    0,
    TZ
  )

  // Bidding ends next Monday: exactly 6 days from post, 3:00 PM ET
  const biddingEndYMD = addDaysYMD(todayET, 6)
  const biddingEndsUTC = zonedTimeToUtc(
    biddingEndYMD.y,
    biddingEndYMD.m,
    biddingEndYMD.d,
    15,
    0,
    0,
    TZ
  )

  const adsEndUnix = Math.floor(adsEndUTC.getTime() / 1000)
  const biddingEndUnix = Math.floor(biddingEndsUTC.getTime() / 1000)

  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(`${emoji.rocket} Ads are now live!`)
        .setColor('#ff3366')
        .setDescription(
          `This week's winning auctions bids are starting to go live and will run until ` +
            `<t:${adsEndUnix}:f> (<t:${adsEndUnix}:R>)\n\n` +
            `[Bidding is now open](https://auctions.top.gg) for next week's auctions and will end on ` +
            `<t:${biddingEndUnix}:f> (<t:${biddingEndUnix}:R>)!\n\n` +
            `Thanks for using Top.gg Auctions! ${emoji.dogThumbUp}`
        )
        .setTimestamp(new Date()),
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
}

/** ---- Helpers ---- */

// GET today's date in ET (YYYY, M, D). Falls back to Intl if API fails.
async function getTodayYMD_ET(): Promise<{ y: number; m: number; d: number }> {
  try {
    const res = await fetch(TIME_API_URL, { method: 'GET', cache: 'no-store' })
    if (!res.ok) throw new Error(`Time API ${res.status}`)

    const data = (await res.json()) as { datetime?: string } // may be missing at runtime
    const iso = data.datetime ?? ''

    // Expect "YYYY-MM-DDTHH:MM:SS±HH:MM"
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T/)
    if (!m) throw new Error('Time API payload missing or malformed "datetime"')

    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])

    return { y, m: mo, d }
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
    return {
      y: Number(parts.year),
      m: Number(parts.month),
      d: Number(parts.day),
    }
  }
}

// Add days to a Y/M/D triple (calendar-accurate via UTC math)
function addDaysYMD(base: { y: number; m: number; d: number }, days: number) {
  const dt = new Date(Date.UTC(base.y, base.m - 1, base.d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

// Convert a wall-clock time in a timezone to the corresponding UTC Date.
// Handles DST correctly for future dates.
function zonedTimeToUtc(
  y: number,
  m: number, // 1-12
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
  const parts = dtf
    .formatToParts(utcGuess)
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
  const offset = asIfInTZ - utcGuess.getTime()
  return new Date(utcGuess.getTime() - offset)
}
