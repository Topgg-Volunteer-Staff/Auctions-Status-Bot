import type { GuildMember } from 'discord.js'

export const VERIFICATION_CENTER_GUILD_ID = '333949691962195969'

export type VerificationCenterBot = {
  id: string
  name: string
  reviewerName: string
  joinedTimestamp: number
}

export type ParsedVerificationCenterBotName = Pick<
  VerificationCenterBot,
  'name' | 'reviewerName'
>

function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function getEditDistance(left: string, right: string): number {
  const previousRow = Array.from(
    { length: right.length + 1 },
    (_, index) => index
  )

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const currentRow = [leftIndex]

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1

      currentRow[rightIndex] = Math.min(
        (currentRow[rightIndex - 1] ?? 0) + 1,
        (previousRow[rightIndex] ?? 0) + 1,
        (previousRow[rightIndex - 1] ?? 0) + substitutionCost
      )
    }

    previousRow.splice(0, previousRow.length, ...currentRow)
  }

  return previousRow[right.length] ?? Math.max(left.length, right.length)
}

function namesAreSimilar(left: string, right: string): boolean {
  const normalizedLeft = normalizeName(left)
  const normalizedRight = normalizeName(right)

  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return true

  const shorterLength = Math.min(normalizedLeft.length, normalizedRight.length)
  if (
    shorterLength >= 3 &&
    (normalizedLeft.includes(normalizedRight) ||
      normalizedRight.includes(normalizedLeft))
  ) {
    return true
  }

  const longerLength = Math.max(normalizedLeft.length, normalizedRight.length)
  return (
    longerLength >= 4 && getEditDistance(normalizedLeft, normalizedRight) <= 1
  )
}

function getMemberNames(member: GuildMember): Array<string> {
  return [member.user.username, member.user.globalName, member.nickname].filter(
    (name): name is string => Boolean(name)
  )
}

export function parseVerificationCenterBotName(
  value: string
): ParsedVerificationCenterBotName | null {
  if (typeof value !== 'string') return null

  const match = /^\s*([^|]+?)\s*\|\s*(.+?)\s*$/.exec(value)
  const reviewerName = match?.[1]?.trim()
  const name = match?.[2]?.trim()

  if (!reviewerName || !name) return null

  return { reviewerName, name }
}

export function getVerificationCenterBot(
  member: GuildMember
): VerificationCenterBot | null {
  if (!member.user.bot) return null

  const parsedName = parseVerificationCenterBotName(member.displayName)
  const joinedTimestamp = member.joinedTimestamp
  if (!parsedName || joinedTimestamp === null) return null

  return {
    id: member.id,
    ...parsedName,
    joinedTimestamp,
  }
}

export function findMemberByName(
  query: string,
  members: Iterable<GuildMember>
): GuildMember | null {
  const normalizedQuery = normalizeName(query)
  if (!normalizedQuery) return null

  const exactMatches = new Map<string, GuildMember>()
  const fuzzyMatches = new Map<string, GuildMember>()

  for (const member of members) {
    const memberNames = getMemberNames(member)

    if (memberNames.some((name) => normalizeName(name) === normalizedQuery)) {
      exactMatches.set(member.id, member)
      continue
    }

    if (memberNames.some((name) => namesAreSimilar(query, name))) {
      fuzzyMatches.set(member.id, member)
    }
  }

  if (exactMatches.size === 1) {
    return exactMatches.values().next().value ?? null
  }
  if (exactMatches.size > 1) return null
  if (fuzzyMatches.size !== 1) return null

  return fuzzyMatches.values().next().value ?? null
}

export function findExactMemberByName(
  query: string,
  members: Iterable<GuildMember>
): GuildMember | null {
  const normalizedQuery = normalizeName(query)
  if (!normalizedQuery) return null

  const exactMatches = new Map<string, GuildMember>()
  for (const member of members) {
    if (
      getMemberNames(member).some(
        (name) => normalizeName(name) === normalizedQuery
      )
    ) {
      exactMatches.set(member.id, member)
    }
  }

  return exactMatches.size === 1
    ? exactMatches.values().next().value ?? null
    : null
}

export async function getBotsForStaffMember(
  member: GuildMember
): Promise<Array<VerificationCenterBot>> {
  const verificationCenter =
    member.client.guilds.cache.get(VERIFICATION_CENTER_GUILD_ID) ??
    (await member.client.guilds
      .fetch(VERIFICATION_CENTER_GUILD_ID)
      .catch(() => null))

  if (!verificationCenter) return []

  const verificationCenterMembers = await verificationCenter.members
    .fetch()
    .catch(() => null)

  if (!verificationCenterMembers) return []

  return [...verificationCenterMembers.values()]
    .map(getVerificationCenterBot)
    .filter(
      (bot): bot is VerificationCenterBot =>
        bot !== null && findMemberByName(bot.reviewerName, [member]) !== null
    )
}
