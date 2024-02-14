type Enumerate<
  N extends number,
  Acc extends Array<number> = [],
> = Acc['length'] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc['length']]>

type IntRange<F extends number, T extends number> = Exclude<
  Enumerate<T>,
  Enumerate<F>
>

const now = {
  get time() {
    return new Date()
  },
}

export default function getNextDayTime(
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun',
  hour: IntRange<0, 24>
) {
  const days = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 0,
  }
  const d = now.time
  d.setUTCDate(d.getUTCDate() + ((7 + days[day] - d.getUTCDay()) % 7))
  d.setUTCHours(hour, 0, 0, 0)
  if (d < new Date()) {
    d.setUTCDate(d.getUTCDate() + 7)
  }
  return Math.floor(d.getTime() / 1000)
}
