import { Collection, CreateIndexesOptions } from 'mongodb'
import { getMongoDatabase } from './mongo'

export interface ResolvedTicketRecord {
  threadId: string
  threadName: string
  resolvedAt: Date
  resolvedByUserId: string
}

export interface AuditDateRange {
  start: Date
  end: Date
}

export interface ResolvedLeaderboardEntry {
  userId: string
  count: number
}

type GroupedResolvedTicketEntry = {
  threadId: string
  threadName: string
  resolvedAt: Date
}

type GroupedResolvedTicketDocument = {
  _id: string
  tickets: Array<GroupedResolvedTicketEntry>
}

const collectionName =
  process.env.MONGODB_RESOLVED_COLLECTION ?? 'resolvedTicketAudits'

let resolvedTicketsCollectionPromise: Promise<
  Collection<GroupedResolvedTicketDocument>
> | null =
  null

const normalizeIndexValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => normalizeIndexValue(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b)
    )
    return `{${entries
      .map(([key, nestedValue]) => `${key}:${normalizeIndexValue(nestedValue)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

const hasEquivalentIndex = async (
  collection: Collection<GroupedResolvedTicketDocument>,
  keys: Record<string, 1 | -1>,
  options: CreateIndexesOptions
): Promise<boolean> => {
  const existingIndexes = await collection.indexes()
  const normalizedKeys = normalizeIndexValue(keys)
  const normalizedPartialFilter = normalizeIndexValue(
    options.partialFilterExpression ?? null
  )
  const unique = options.unique === true

  return existingIndexes.some((index) => {
    const indexKeys = normalizeIndexValue(index.key as Record<string, unknown>)
    const indexPartialFilter = normalizeIndexValue(
      ('partialFilterExpression' in index
        ? index.partialFilterExpression
        : null) ?? null
    )
    const indexUnique = index.unique === true

    return (
      indexKeys === normalizedKeys &&
      indexPartialFilter === normalizedPartialFilter &&
      indexUnique === unique
    )
  })
}

const ensureIndex = async (
  collection: Collection<GroupedResolvedTicketDocument>,
  keys: Record<string, 1 | -1>,
  options: CreateIndexesOptions
): Promise<void> => {
  if (await hasEquivalentIndex(collection, keys, options)) {
    return
  }

  await collection.createIndex(keys, options)
}
const getResolvedTicketsCollection = async (): Promise<
  Collection<GroupedResolvedTicketDocument>
> => {
  if (!resolvedTicketsCollectionPromise) {
    resolvedTicketsCollectionPromise = (async () => {
      const db = await getMongoDatabase()
      const collection = db.collection<GroupedResolvedTicketDocument>(
        collectionName
      )

      await ensureIndex(collection, { 'tickets.threadId': 1 }, {
        name: 'groupedTickets_threadId_unique',
        unique: true,
        partialFilterExpression: {
          'tickets.threadId': { $exists: true },
        },
      })

      await ensureIndex(collection, { 'tickets.resolvedAt': 1 }, {
        name: 'groupedTickets_resolvedAt_1',
        partialFilterExpression: {
          'tickets.resolvedAt': { $exists: true },
        },
      })

      return collection
    })()
  }

  return resolvedTicketsCollectionPromise
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isDateLike = (value: unknown): value is Date =>
  value instanceof Date && !Number.isNaN(value.getTime())

const normalizeResolvedAt = (value: unknown): Date | null => {
  if (isDateLike(value)) return value

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  return null
}

const toResolvedTicketRecord = (
  value: unknown,
  fallbackUserId?: string
): ResolvedTicketRecord | null => {
  if (!isObject(value)) return null

  const threadId = value.threadId
  const threadName = value.threadName
  const resolvedAt = normalizeResolvedAt(value.resolvedAt)
  const resolvedByUserId =
    typeof value.resolvedByUserId === 'string'
      ? value.resolvedByUserId
      : fallbackUserId

  if (
    typeof threadId !== 'string' ||
    typeof threadName !== 'string' ||
    !resolvedAt ||
    typeof resolvedByUserId !== 'string'
  ) {
    return null
  }

  return {
    threadId,
    threadName,
    resolvedAt,
    resolvedByUserId,
  }
}

const isGroupedResolvedTicketDocument = (
  value: unknown
): value is GroupedResolvedTicketDocument => {
  return (
    isObject(value) &&
    typeof value._id === 'string' &&
    Array.isArray(value.tickets)
  )
}

export const recordResolvedTicket = async (
  record: ResolvedTicketRecord
): Promise<void> => {
  const collection = await getResolvedTicketsCollection()

  await collection.updateMany(
    {
      _id: { $ne: record.resolvedByUserId },
      'tickets.threadId': record.threadId,
    },
    {
      $pull: {
        tickets: {
          threadId: record.threadId,
        },
      },
    }
  )

  await collection.updateOne(
    { _id: record.resolvedByUserId },
    {
      $pull: {
        tickets: {
          threadId: record.threadId,
        },
      },
      $push: {
        tickets: {
          threadId: record.threadId,
          threadName: record.threadName,
          resolvedAt: record.resolvedAt,
        },
      },
    },
    { upsert: true }
  )
}

export const getResolvedLeaderboard = async (
  range: AuditDateRange
): Promise<Array<ResolvedLeaderboardEntry>> => {
  const collection = await getResolvedTicketsCollection()

  return collection
    .aggregate<ResolvedLeaderboardEntry>([
      {
        $match: {
          tickets: { $type: 'array' },
        },
      },
      {
        $unwind: '$tickets',
      },
      {
        $match: {
          'tickets.resolvedAt': {
            $gte: range.start,
            $lte: range.end,
          },
        },
      },
      {
        $group: {
          _id: '$_id',
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          count: 1,
        },
      },
      {
        $sort: {
          count: -1,
          userId: 1,
        },
      },
    ])
    .toArray()
}

export const getResolvedTicketsByUser = async (
  userId: string,
  range: AuditDateRange
): Promise<Array<ResolvedTicketRecord>> => {
  const collection = await getResolvedTicketsCollection()

  const groupedDocRaw = await collection.findOne({ _id: userId })

  if (!isGroupedResolvedTicketDocument(groupedDocRaw)) {
    return []
  }

  return groupedDocRaw.tickets
    .map((ticket) => toResolvedTicketRecord(ticket, groupedDocRaw._id))
    .filter((ticket): ticket is ResolvedTicketRecord => ticket !== null)
    .filter(
      (ticket) =>
        ticket.resolvedAt >= range.start && ticket.resolvedAt <= range.end
    )
    .sort(
    (a, b) => b.resolvedAt.getTime() - a.resolvedAt.getTime()
  )
}