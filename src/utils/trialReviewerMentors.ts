import { readFileSync } from 'node:fs'
import path from 'node:path'

type MentorMap = Record<string, string>

const STORE_PATH = path.join(
  process.cwd(),
  'data',
  'trial-reviewer-mentors.json'
)

function isSnowflake(value: unknown): value is string {
  return typeof value === 'string' && /^\d{10,30}$/.test(value)
}

export function getMentorIdForTrialReviewer(reviewerId: string): string | null {
  if (!isSnowflake(reviewerId)) return null

  try {
    const raw = readFileSync(STORE_PATH, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null

    const map = parsed as MentorMap
    const mentorId = map[reviewerId]
    return isSnowflake(mentorId) ? mentorId : null
  } catch (err) {
    const maybe = err as { code?: unknown }
    // ENOENT is fine (file may not exist yet). Anything else: treat as non-fatal.
    if (maybe.code !== 'ENOENT') {
      console.error('Failed to load trial reviewer mentors store:', err)
    }
    return null
  }
}
