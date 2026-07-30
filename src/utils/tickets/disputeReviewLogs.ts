import type {
  Collection,
  Guild,
  GuildMember,
  Message,
  TextChannel,
} from 'discord.js'
import { roleIds } from '../../globals'
import { getMentorIdForTrialReviewer } from '../trialReviewerMentors'

const REVIEW_LOG_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000

export type BotReviewLogResult =
  | { kind: 'approved'; message: Message }
  | { kind: 'declined'; message: Message }
  | { kind: 'not-found' }

export type DisputeReviewer = {
  mentorId: string | null
  reviewerId: string
  reviewerName: string
}

function extractReviewerSearchQuery(value: string): string | null {
  const cleaned = value
    .replace(/<@!?\d+>/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/top\.gg profile/gi, '')
    .replace(/^@/g, '')
    .trim()

  if (cleaned.length < 2) return null
  return cleaned.slice(0, 32)
}

export async function findRecentBotReviewLog(
  modLogs: TextChannel,
  botId: string
): Promise<BotReviewLogResult> {
  const cutoff = Date.now() - REVIEW_LOG_LOOKBACK_MS

  const searchPage = async (
    before: string | undefined
  ): Promise<BotReviewLogResult> => {
    const fetched = await modLogs.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    })

    if (fetched.size === 0) return { kind: 'not-found' }

    for (const message of fetched.values()) {
      if (message.createdTimestamp < cutoff) return { kind: 'not-found' }

      const embed = message.embeds[0]
      if (!embed) continue

      const botField = embed.fields.find(
        (field) => field.name.toLowerCase() === 'bot'
      )
      const loggedBotId = botField?.value.match(/\((\d+)\)/)?.[1]
      if (loggedBotId !== botId) continue

      return embed.title?.toLowerCase() === 'bot approved'
        ? { kind: 'approved', message }
        : { kind: 'declined', message }
    }

    const lastFetched = fetched.last()
    if (!lastFetched || lastFetched.createdTimestamp < cutoff) {
      return { kind: 'not-found' }
    }

    return searchPage(lastFetched.id)
  }

  return searchPage(undefined)
}

export async function resolveDisputeReviewer(
  guild: Guild,
  reviewLog: Message
): Promise<DisputeReviewer> {
  const reviewerField = reviewLog.embeds[0]?.fields.find(
    (field) => field.name.toLowerCase() === 'reviewer'
  )
  if (!reviewerField) {
    return { mentorId: null, reviewerId: '', reviewerName: 'Unknown' }
  }

  const mentionMatch = reviewerField.value.match(/<@!?(\d+)>/)
  const idMatch = reviewerField.value.match(/\b(\d{15,22})\b/)
  const potentialReviewerId = mentionMatch?.[1] ?? idMatch?.[1] ?? null

  let reviewerMember: GuildMember | null = null
  if (potentialReviewerId) {
    reviewerMember = await guild.members
      .fetch(potentialReviewerId)
      .catch(() => null)
  }

  if (!reviewerMember) {
    const query = extractReviewerSearchQuery(reviewerField.value)
    if (query) {
      const matches = (await guild.members
        // discord.js v14: guild.members.search
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .search({ query, limit: 10 } as any)
        .catch(() => null)) as Collection<string, GuildMember> | null

      const candidates = Array.from(matches?.values() ?? []).filter(
        (member) =>
          member.roles.cache.has(roleIds.reviewer) ||
          member.roles.cache.has(roleIds.trialReviewer)
      )
      reviewerMember = candidates[0] ?? null
    }
  }

  if (
    !reviewerMember ||
    (!reviewerMember.roles.cache.has(roleIds.reviewer) &&
      !reviewerMember.roles.cache.has(roleIds.trialReviewer))
  ) {
    return { mentorId: null, reviewerId: '', reviewerName: 'Unknown' }
  }

  const reviewerId = reviewerMember.id
  const mappedMentorId = await getMentorIdForTrialReviewer(reviewerId).catch(
    () => null
  )

  return {
    mentorId:
      mappedMentorId && mappedMentorId !== reviewerId ? mappedMentorId : null,
    reviewerId,
    reviewerName: reviewerMember.user.username,
  }
}
