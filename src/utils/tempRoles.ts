import {
  Client,
  Guild,
  GuildMember,
  Role,
  Snowflake,
} from 'discord.js'

import {
  loadMongoBackedJson,
  saveMongoBackedJson,
} from './db/mongoBackedJsonStore'
import { sendErrorLog, sendMongoErrorLog } from './errorLogging'

const TEMP_ROLE_STORE_KEY = 'temp-roles'
const MAX_TIMEOUT_MS = 2_147_483_647

type TempRoleEntry = {
  guildId: string
  userId: string
  roleId: string
  moderatorId: string
  reason: string
  expiresAt: number
  createdAt: number
}

const tempRoleEntries = new Map<string, TempRoleEntry>()
const tempRoleTimers = new Map<string, NodeJS.Timeout>()

let tempRoleClient: Client | null = null
let initPromise: Promise<void> | null = null
let writeChain: Promise<void> = Promise.resolve()

const entryKey = (guildId: string, userId: string, roleId: string): string =>
  `${guildId}:${userId}:${roleId}`

function clearRemovalTimer(key: string): void {
  const existing = tempRoleTimers.get(key)
  if (existing) {
    clearTimeout(existing)
    tempRoleTimers.delete(key)
  }
}

function sanitizeLoadedEntry(value: unknown): TempRoleEntry | null {
  if (!value || typeof value !== 'object') return null

  const candidate = value as Partial<TempRoleEntry>

  if (
    typeof candidate.guildId !== 'string' ||
    typeof candidate.userId !== 'string' ||
    typeof candidate.roleId !== 'string' ||
    typeof candidate.moderatorId !== 'string' ||
    typeof candidate.reason !== 'string' ||
    typeof candidate.expiresAt !== 'number' ||
    typeof candidate.createdAt !== 'number'
  ) {
    return null
  }

  if (
    !Number.isFinite(candidate.expiresAt) ||
    !Number.isFinite(candidate.createdAt)
  ) {
    return null
  }

  return {
    guildId: candidate.guildId,
    userId: candidate.userId,
    roleId: candidate.roleId,
    moderatorId: candidate.moderatorId,
    reason: candidate.reason,
    expiresAt: candidate.expiresAt,
    createdAt: candidate.createdAt,
  }
}

async function persistStore(): Promise<void> {
  const payload = Array.from(tempRoleEntries.values())
  await saveMongoBackedJson(TEMP_ROLE_STORE_KEY, payload, {
    operation: 'persist',
  })
}

function queuePersist(): Promise<void> {
  writeChain = writeChain.then(() => persistStore()).catch(() => persistStore())
  return writeChain
}

async function fetchGuild(guildId: Snowflake): Promise<Guild | null> {
  if (!tempRoleClient) return null
  return tempRoleClient.guilds.fetch(guildId).catch(() => null)
}

async function fetchMember(
  guild: Guild,
  userId: Snowflake
): Promise<GuildMember | null> {
  return guild.members.fetch(userId).catch(() => null)
}

async function fetchRole(guild: Guild, roleId: Snowflake): Promise<Role | null> {
  return guild.roles.fetch(roleId).catch(() => null)
}

async function deleteEntry(key: string): Promise<void> {
  clearRemovalTimer(key)
  tempRoleEntries.delete(key)
  await queuePersist().catch((error) => {
    if (!tempRoleClient) return
    void sendMongoErrorLog(tempRoleClient, 'tempRole.persist.delete.failed', error)
  })
}

async function removeExpiredRole(entry: TempRoleEntry): Promise<void> {
  const key = entryKey(entry.guildId, entry.userId, entry.roleId)
  clearRemovalTimer(key)

  const client = tempRoleClient
  if (!client) return

  const guild = await fetchGuild(entry.guildId)
  if (!guild) {
    await deleteEntry(key)
    return
  }

  const member = await fetchMember(guild, entry.userId)
  if (!member) {
    await deleteEntry(key)
    return
  }

  const role = await fetchRole(guild, entry.roleId)
  if (!role) {
    await deleteEntry(key)
    return
  }

  if (member.roles.cache.has(role.id)) {
    try {
      await member.roles.remove(
        role,
        `Temporary role expired. Original reason: ${entry.reason}`
      )
    } catch (error) {
      void sendErrorLog(client, 'tempRole.remove.failed', error, {
        guildId: entry.guildId,
        userId: entry.userId,
        roleId: entry.roleId,
      })
      scheduleRemoval(entry)
      return
    }
  }

  await deleteEntry(key)
}

function scheduleRemoval(entry: TempRoleEntry): void {
  const key = entryKey(entry.guildId, entry.userId, entry.roleId)
  clearRemovalTimer(key)

  const remainingMs = entry.expiresAt - Date.now()
  const nextDelay = Math.min(Math.max(remainingMs, 0), MAX_TIMEOUT_MS)

  const timer = setTimeout(() => {
    if (Date.now() >= entry.expiresAt) {
      void removeExpiredRole(entry)
      return
    }

    scheduleRemoval(entry)
  }, nextDelay)

  tempRoleTimers.set(key, timer)
}

export async function initializeTempRoleStore(client: Client): Promise<void> {
  tempRoleClient = client
  if (initPromise) return initPromise

  initPromise = (async () => {
    const loaded = await loadMongoBackedJson<unknown>(TEMP_ROLE_STORE_KEY, [])
    const entries = Array.isArray(loaded) ? loaded : []

    tempRoleEntries.clear()

    for (const value of entries) {
      const entry = sanitizeLoadedEntry(value)
      if (!entry) continue

      const key = entryKey(entry.guildId, entry.userId, entry.roleId)
      tempRoleEntries.set(key, entry)
    }

    for (const entry of tempRoleEntries.values()) {
      if (entry.expiresAt <= Date.now()) {
        void removeExpiredRole(entry)
        continue
      }

      scheduleRemoval(entry)
    }
  })()

  return initPromise
}

export function parseTempRoleDuration(input: string): number | null {
  const normalized = input.trim().toLowerCase()
  if (!normalized) return null

  const pattern = /(\d+)\s*(mo|w|d|h|m|s)/g
  let totalMs = 0
  let matchedLength = 0

  for (const match of normalized.matchAll(pattern)) {
    const amountRaw = match[1]
    const unit = match[2]
    const whole = match[0]

    if (!amountRaw || !unit || !whole) return null

    const amount = Number(amountRaw)
    if (!Number.isFinite(amount) || amount <= 0) return null

    matchedLength += whole.length

    switch (unit) {
      case 's':
        totalMs += amount * 1_000
        break
      case 'm':
        totalMs += amount * 60_000
        break
      case 'h':
        totalMs += amount * 3_600_000
        break
      case 'd':
        totalMs += amount * 86_400_000
        break
      case 'w':
        totalMs += amount * 604_800_000
        break
      case 'mo':
        totalMs += amount * 2_592_000_000
        break
      default:
        return null
    }
  }

  const compact = normalized.replace(/\s+/g, '')
  const reconstructed = Array.from(normalized.matchAll(pattern))
    .map((match) => match[0].replace(/\s+/g, ''))
    .join('')

  if (matchedLength === 0 || compact !== reconstructed || totalMs <= 0) {
    return null
  }

  return totalMs
}

export async function createOrReplaceTempRole(entry: TempRoleEntry): Promise<void> {
  if (!tempRoleClient) {
    throw new Error('Temp role store has not been initialized yet.')
  }

  const key = entryKey(entry.guildId, entry.userId, entry.roleId)
  tempRoleEntries.set(key, entry)
  scheduleRemoval(entry)

  await queuePersist().catch((error) => {
    void sendMongoErrorLog(tempRoleClient as Client, 'tempRole.persist.failed', error)
    throw error
  })
}
