import {
  Client,
  GuildMember,
  MessageCreateOptions,
  TextChannel,
} from 'discord.js'

import { channelIds, roleIds } from '../../globals'
import { COMPONENTS_V2_FLAGS, createTextPanel } from '../componentsV2'
import {
  loadMongoBackedJson,
  saveMongoBackedJson,
} from '../db/mongoBackedJsonStore'
import {
  findMemberByName,
  getVerificationCenterBot,
  VERIFICATION_CENTER_GUILD_ID,
} from './botMembers'

const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
const REMINDER_WINDOW = 24 * 60 * 60 * 1000
const STORE_KEY = 'inactive-verification-center-bot-alerts'
const REMINDER_ALERT_COLOR = 0xff3366
const VERIFICATION_CENTER_REMINDER_EXEMPT_ROLE_ID = '357194464776814603'

type ReminderKey = '48h' | `7d:${number}`

export type VerificationCenterBotReminder = {
  key: ReminderKey
  minimumAgeDays: number
  weeklyInterval: number | null
}

type VerificationCenterBotReminderState = {
  joinedAt: number
  sent48h: boolean
  last7dInterval: number
  lastUnresolvedReminderKey: ReminderKey | null
}

type PersistedVerificationCenterBotReminders = Record<
  string,
  VerificationCenterBotReminderState
>

const reminderStates = new Map<string, VerificationCenterBotReminderState>()

let initPromise: Promise<void> | null = null
let writeChain: Promise<void> = Promise.resolve()
let checkInProgress = false

function isReminderKey(value: unknown): value is ReminderKey {
  return (
    value === '48h' ||
    (typeof value === 'string' && /^7d:[1-9]\d*$/.test(value))
  )
}

function normalizeReminderState(
  value: unknown
): VerificationCenterBotReminderState | null {
  if (!value || typeof value !== 'object') return null

  const state = value as Record<string, unknown>
  if (
    typeof state.joinedAt !== 'number' ||
    !Number.isFinite(state.joinedAt) ||
    typeof state.sent48h !== 'boolean' ||
    typeof state.last7dInterval !== 'number' ||
    !Number.isInteger(state.last7dInterval) ||
    state.last7dInterval < 0
  ) {
    return null
  }

  return {
    joinedAt: state.joinedAt,
    sent48h: state.sent48h,
    last7dInterval: state.last7dInterval,
    lastUnresolvedReminderKey: isReminderKey(state.lastUnresolvedReminderKey)
      ? state.lastUnresolvedReminderKey
      : null,
  }
}

export async function initializeVerificationCenterBotReminderStore(): Promise<void> {
  if (initPromise) return initPromise

  initPromise = (async () => {
    const parsed = await loadMongoBackedJson<unknown>(
      STORE_KEY,
      {},
      {
        throwOnError: true,
      }
    )
    if (!parsed || typeof parsed !== 'object') return

    reminderStates.clear()
    for (const [botId, rawState] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (!botId) continue

      const state = normalizeReminderState(rawState)
      if (state) reminderStates.set(botId, state)
    }
  })().catch((error: unknown) => {
    initPromise = null
    throw error
  })

  return initPromise
}

async function persistReminderStates(): Promise<void> {
  const persisted: PersistedVerificationCenterBotReminders = {}
  for (const [botId, state] of reminderStates.entries()) {
    persisted[botId] = state
  }

  await saveMongoBackedJson(STORE_KEY, persisted, { operation: 'persist' })
}

function queuePersistReminderStates(): Promise<void> {
  writeChain = writeChain
    .then(() => persistReminderStates())
    .catch(() => persistReminderStates())

  return writeChain
}

export function hasVerificationCenterReminderExemptRole(
  member: GuildMember
): boolean {
  return member.roles.cache.has(VERIFICATION_CENTER_REMINDER_EXEMPT_ROLE_ID)
}

export function getDueVerificationCenterBotReminder(
  timeInVerificationCenter: number,
  sent48h: boolean,
  last7dInterval: number,
  lastUnresolvedReminderKey: ReminderKey | null = null
): VerificationCenterBotReminder | null {
  if (
    !Number.isFinite(timeInVerificationCenter) ||
    timeInVerificationCenter < 0
  ) {
    return null
  }

  const currentWeeklyInterval = Math.floor(
    timeInVerificationCenter / SEVEN_DAYS
  )
  const currentWeeklyIntervalStartedAt = currentWeeklyInterval * SEVEN_DAYS
  const isInCurrentWeeklyReminderWindow =
    timeInVerificationCenter < currentWeeklyIntervalStartedAt + REMINDER_WINDOW

  if (
    currentWeeklyInterval >= 1 &&
    currentWeeklyInterval > last7dInterval &&
    isInCurrentWeeklyReminderWindow
  ) {
    const key: ReminderKey = `7d:${currentWeeklyInterval}`
    if (lastUnresolvedReminderKey === key) return null

    return {
      key,
      minimumAgeDays: currentWeeklyInterval * 7,
      weeklyInterval: currentWeeklyInterval,
    }
  }

  if (
    timeInVerificationCenter >= FORTY_EIGHT_HOURS &&
    timeInVerificationCenter < FORTY_EIGHT_HOURS + REMINDER_WINDOW &&
    !sent48h
  ) {
    if (lastUnresolvedReminderKey === '48h') return null

    return {
      key: '48h',
      minimumAgeDays: 2,
      weeklyInterval: null,
    }
  }

  return null
}

function formatInlineCode(value: string): string {
  return `\`${value.replace(/`/g, '\u02cb')}\``
}

export function buildVerificationCenterBotReminderContent(
  reviewerId: string,
  bot: { id: string; joinedTimestamp: number }
): string {
  return `<@${reviewerId}> -> Please check <@${bot.id}> (\`${
    bot.id
  }\`) in the VC. It joined <t:${Math.floor(bot.joinedTimestamp / 1000)}:R>.`
}

export function buildUnresolvedVerificationCenterBotReminderContent(bot: {
  id: string
  reviewerName: string
  joinedTimestamp: number
}): string {
  return `Please check <@${bot.id}> (\`${
    bot.id
  }\`) in the VC. It joined <t:${Math.floor(
    bot.joinedTimestamp / 1000
  )}:R>. Could not match reviewer ${formatInlineCode(bot.reviewerName)}.`
}

export function buildVerificationCenterBotReminderMessage(
  reviewerId: string,
  bot: { id: string; joinedTimestamp: number }
): MessageCreateOptions {
  return {
    components: [
      createTextPanel({
        accentColor: REMINDER_ALERT_COLOR,
        description: buildVerificationCenterBotReminderContent(reviewerId, bot),
      }),
    ],
    flags: COMPONENTS_V2_FLAGS,
    allowedMentions: {
      users: [reviewerId, bot.id],
      roles: [],
      parse: [],
    },
  }
}

export function buildUnresolvedVerificationCenterBotReminderMessage(bot: {
  id: string
  reviewerName: string
  joinedTimestamp: number
}): MessageCreateOptions {
  return {
    components: [
      createTextPanel({
        accentColor: REMINDER_ALERT_COLOR,
        description: buildUnresolvedVerificationCenterBotReminderContent(bot),
      }),
    ],
    flags: COMPONENTS_V2_FLAGS,
    allowedMentions: { users: [bot.id], roles: [], parse: [] },
  }
}

async function sendReviewerReminder(
  channel: TextChannel,
  reviewer: GuildMember,
  bot: { id: string; joinedTimestamp: number }
): Promise<boolean> {
  try {
    await channel.send(
      buildVerificationCenterBotReminderMessage(reviewer.id, bot)
    )
    return true
  } catch (error) {
    console.error(
      `Failed to send VC idle reminder for bot ${bot.id} to reviewer ${reviewer.id}:`,
      error
    )
    return false
  }
}

async function sendUnresolvedReviewerReminder(
  channel: TextChannel,
  bot: {
    id: string
    reviewerName: string
    joinedTimestamp: number
  }
): Promise<boolean> {
  try {
    await channel.send(buildUnresolvedVerificationCenterBotReminderMessage(bot))
    return true
  } catch (error) {
    console.error(
      `Failed to send unresolved VC idle reminder for bot ${bot.id}:`,
      error
    )
    return false
  }
}

function markReminderSent(
  state: VerificationCenterBotReminderState,
  reminder: VerificationCenterBotReminder
): void {
  state.sent48h = true
  if (reminder.weeklyInterval !== null) {
    state.last7dInterval = reminder.weeklyInterval
  }
  state.lastUnresolvedReminderKey = null
}

export async function checkVerificationCenterBotReminders(
  client: Client
): Promise<void> {
  if (checkInProgress) {
    console.warn('Skipping overlapping VC idle bot check')
    return
  }

  checkInProgress = true
  try {
    await runVerificationCenterBotReminderCheck(client)
  } finally {
    checkInProgress = false
  }
}

async function runVerificationCenterBotReminderCheck(
  client: Client
): Promise<void> {
  await initializeVerificationCenterBotReminderStore()

  const reviewerChannel = (await client.channels
    .fetch(channelIds.inactiveThreadAlertsReviewers)
    .catch(() => null)) as TextChannel | null

  if (!reviewerChannel) {
    console.error(
      `Reviewer alerts channel ${channelIds.inactiveThreadAlertsReviewers} not found for VC idle bot check`
    )
    return
  }

  const verificationCenter =
    client.guilds.cache.get(VERIFICATION_CENTER_GUILD_ID) ??
    (await client.guilds.fetch(VERIFICATION_CENTER_GUILD_ID).catch(() => null))

  if (!verificationCenter) {
    console.error(
      `Verification center guild ${VERIFICATION_CENTER_GUILD_ID} not found`
    )
    return
  }

  const [mainGuildMembers, verificationCenterMembers] = await Promise.all([
    reviewerChannel.guild.members.fetch().catch(() => null),
    verificationCenter.members.fetch().catch(() => null),
  ])

  if (!mainGuildMembers || !verificationCenterMembers) {
    console.error('Failed to fetch members for the VC idle bot check')
    return
  }

  const reviewerCandidates = mainGuildMembers.filter(
    (member) =>
      !member.user.bot &&
      (member.roles.cache.has(roleIds.reviewer) ||
        member.roles.cache.has(roleIds.trialReviewer))
  )
  const presentBotIds = new Set<string>()
  const now = Date.now()
  let stateChanged = false

  for (const member of verificationCenterMembers.values()) {
    if (!member.user.bot) continue
    presentBotIds.add(member.id)

    if (hasVerificationCenterReminderExemptRole(member)) continue

    const bot = getVerificationCenterBot(member)
    if (!bot) continue

    try {
      let state = reminderStates.get(bot.id)
      if (!state || state.joinedAt !== bot.joinedTimestamp) {
        state = {
          joinedAt: bot.joinedTimestamp,
          sent48h: false,
          last7dInterval: 0,
          lastUnresolvedReminderKey: null,
        }
        reminderStates.set(bot.id, state)
        stateChanged = true
      }

      const reminder = getDueVerificationCenterBotReminder(
        now - bot.joinedTimestamp,
        state.sent48h,
        state.last7dInterval,
        state.lastUnresolvedReminderKey
      )
      if (!reminder) continue

      const reviewer = findMemberByName(
        bot.reviewerName,
        reviewerCandidates.values()
      )

      if (!reviewer) {
        const warningSent = await sendUnresolvedReviewerReminder(
          reviewerChannel,
          bot
        )
        if (warningSent) {
          state.lastUnresolvedReminderKey = reminder.key
          stateChanged = true
        }
        continue
      }

      const reminderSent = await sendReviewerReminder(
        reviewerChannel,
        reviewer,
        bot
      )
      if (reminderSent) {
        markReminderSent(state, reminder)
        stateChanged = true
      }
    } catch (error) {
      console.error(`Failed to check VC bot ${member.id}:`, error)
    }
  }

  for (const botId of reminderStates.keys()) {
    if (presentBotIds.has(botId)) continue
    reminderStates.delete(botId)
    stateChanged = true
  }

  if (stateChanged) {
    await queuePersistReminderStates().catch(() => void 0)
  }
}
