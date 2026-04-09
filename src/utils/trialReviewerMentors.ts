import {
  loadMongoBackedJson,
  saveMongoBackedJson,
} from './db/mongoBackedJsonStore'

type MentorMap = Record<string, string>
type StoreShape = MentorMap & { _comment?: string }

const STORE_KEY = 'trial-reviewer-mentors'

const DEFAULT_COMMENT =
  'This file links trial reviewers to their mentors. { "TRIAL_REVIEWER_USER_ID": "MENTOR_USER_ID" }'

function isSnowflake(value: unknown): value is string {
  return typeof value === 'string' && /^\d{10,30}$/.test(value)
}

function normalizeStore(parsed: unknown): { comment: string; map: MentorMap } {
  const out: MentorMap = {}

  if (!parsed || typeof parsed !== 'object') {
    return { comment: DEFAULT_COMMENT, map: out }
  }

  const obj = parsed as Record<string, unknown>
  const comment =
    typeof obj._comment === 'string' && obj._comment.trim().length > 0
      ? obj._comment
      : DEFAULT_COMMENT

  for (const [k, v] of Object.entries(obj)) {
    if (k === '_comment') continue
    if (!isSnowflake(k)) continue
    if (!isSnowflake(v)) continue
    out[k] = v
  }

  return { comment, map: out }
}

function buildStoreFile(comment: string, map: MentorMap): StoreShape {
  // Keep the comment at the top for human editors.
  const out: StoreShape = { _comment: comment }
  const entries = Object.entries(map)
  for (const [trialId, mentorId] of entries) {
    out[trialId] = mentorId
  }
  return out
}

async function loadStore(): Promise<{ comment: string; map: MentorMap }> {
  const raw = await loadMongoBackedJson<unknown>(
    STORE_KEY,
    buildStoreFile(DEFAULT_COMMENT, {})
  )
  return normalizeStore(raw)
}

async function persistStore(comment: string, map: MentorMap): Promise<void> {
  await saveMongoBackedJson(STORE_KEY, buildStoreFile(comment, map), {
    operation: 'persist',
  })
}

let storeWriteChain: Promise<void> = Promise.resolve()

function queuePersistStore(comment: string, map: MentorMap): Promise<void> {
  storeWriteChain = storeWriteChain
    .then(() => persistStore(comment, map))
    .catch(() => persistStore(comment, map))
  return storeWriteChain
}

export async function getMentorIdForTrialReviewer(
  reviewerId: string
): Promise<string | null> {
  if (!isSnowflake(reviewerId)) return null

  const { map } = await loadStore()
  const mentorId = map[reviewerId]
  return isSnowflake(mentorId) ? mentorId : null
}

export async function setMentorForTrialReviewer(
  reviewerId: string,
  mentorId: string
): Promise<{ created: boolean; previousMentorId: string | null }> {
  if (!isSnowflake(reviewerId) || !isSnowflake(mentorId)) {
    throw new Error('Invalid reviewerId or mentorId')
  }

  const { comment, map } = await loadStore()
  const existing = map[reviewerId]
  const previousMentorId = isSnowflake(existing) ? existing : null
  map[reviewerId] = mentorId
  await queuePersistStore(comment, map)

  return { created: previousMentorId === null, previousMentorId }
}

export async function removeTrialReviewerMentor(
  reviewerId: string
): Promise<{ removed: boolean; previousMentorId: string | null }> {
  if (!isSnowflake(reviewerId)) {
    throw new Error('Invalid reviewerId')
  }

  const { comment, map } = await loadStore()
  const existing = map[reviewerId]
  const previousMentorId = isSnowflake(existing) ? existing : null
  const removed = typeof existing === 'string'
  delete map[reviewerId]

  if (removed) {
    await queuePersistStore(comment, map)
  }

  return { removed, previousMentorId }
}

export async function listTrialReviewerMentors(): Promise<
  Array<{ reviewerId: string; mentorId: string }>
> {
  const { map } = await loadStore()
  return Object.entries(map)
    .filter(([reviewerId, mentorId]) => isSnowflake(reviewerId) && isSnowflake(mentorId))
    .map(([reviewerId, mentorId]) => ({ reviewerId, mentorId }))
    .sort((a, b) => a.reviewerId.localeCompare(b.reviewerId))
}
