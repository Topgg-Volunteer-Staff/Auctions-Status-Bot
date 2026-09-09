import { resolvedFlag } from '../../globals'

// Dispute threads are created as `Dispute - <user> <> <reviewer>`; the same
// normalization the unresolved/my-tickets commands use keeps odd dashes and
// zero-width characters from hiding one.
// Alternation rather than a character class: the zero-width joiner would read
// as a joined sequence inside one.
const zeroWidthPattern = new RegExp(
  [0x200b, 0x200c, 0x200d, 0xfeff]
    .map((code) => String.fromCharCode(code))
    .join('|'),
  'g'
)
const dashPattern = new RegExp(
  `[${String.fromCharCode(0x2013, 0x2014, 0x2212)}]`,
  'g'
)

const normalizeName = (value: string): string =>
  value
    .replace(zeroWidthPattern, '')
    .replace(dashPattern, '-')
    .replace(/\s*-\s*/g, '-')
    .trim()
    .toLowerCase()

export const isDisputeThreadName = (threadName: string): boolean => {
  const normalized = normalizeName(threadName)
  const resolvedPrefix = normalizeName(resolvedFlag)

  // `/resolve` prefixes the name with the resolved flag, so strip it before
  // looking for the dispute prefix.
  const withoutResolvedFlag = normalized.startsWith(resolvedPrefix)
    ? normalized.slice(resolvedPrefix.length).replace(/^[\s-]+/, '')
    : normalized

  return withoutResolvedFlag.startsWith('dispute-')
}
