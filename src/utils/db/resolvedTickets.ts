import { Collection, ObjectId } from 'mongodb'
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

export interface ResolvedTicketMigrationResult {
  scannedLegacyDocuments: number
  migratedLegacyDocuments: number
  skippedLegacyDocuments: number
  groupedUsersUpdated: number
  deletedLegacyDocuments: number
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

type LegacyResolvedTicketDocument = ResolvedTicketRecord & {
  _id: ObjectId
}

type ResolvedTicketsDocument =
  | GroupedResolvedTicketDocument
  | LegacyResolvedTicketDocument

const collectionName =
  process.env.MONGODB_RESOLVED_COLLECTION ?? 'resolvedTicketAudits'

let resolvedTicketsCollectionPromise: Promise<
  Collection<ResolvedTicketsDocument>
> | null =
  null

const getResolvedTicketsCollection = async (): Promise<
  Collection<ResolvedTicketsDocument>
> => {
  if (!resolvedTicketsCollectionPromise) {
    resolvedTicketsCollectionPromise = (async () => {
      const db = await getMongoDatabase()
      const collection = db.collection<ResolvedTicketsDocument>(collectionName)

      await Promise.all([
        collection.createIndex(
          { 'tickets.threadId': 1 },
          {
            unique: true,
            partialFilterExpression: {
              'tickets.threadId': { $exists: true },
            },
          }
        ),
        collection.createIndex(
          { 'tickets.resolvedAt': 1 },
          {
            partialFilterExpression: {
              'tickets.resolvedAt': { $exists: true },
            },
          }
        ),
        collection.createIndex(
          { resolvedByUserId: 1, resolvedAt: 1 },
          {
            partialFilterExpression: {
              resolvedByUserId: { $exists: true },
              resolvedAt: { $exists: true },
            },
          }
        ),
      ])

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

const toGroupedResolvedTicketEntry = (
  value: unknown
): GroupedResolvedTicketEntry | null => {
  if (!isObject(value)) return null

  const threadId = value.threadId
  const threadName = value.threadName
  const resolvedAt = normalizeResolvedAt(value.resolvedAt)

  if (
    typeof threadId !== 'string' ||
    typeof threadName !== 'string' ||
    !resolvedAt
  ) {
    return null
  }

  return {
    threadId,
    threadName,
    resolvedAt,
  }
}

const mergeTicketEntry = (
  ticketMap: Map<string, GroupedResolvedTicketEntry>,
  ticket: GroupedResolvedTicketEntry
): void => {
  const existing = ticketMap.get(ticket.threadId)
  if (!existing || ticket.resolvedAt.getTime() >= existing.resolvedAt.getTime()) {
    ticketMap.set(ticket.threadId, ticket)
  }
}

const combineLeaderboardCounts = (
  entries: Array<ResolvedLeaderboardEntry>
): Array<ResolvedLeaderboardEntry> => {
  const counts = new Map<string, number>()

  for (const entry of entries) {
    counts.set(entry.userId, (counts.get(entry.userId) ?? 0) + entry.count)
  }

  return Array.from(counts.entries())
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count || a.userId.localeCompare(b.userId))
}

export const recordResolvedTicket = async (
  record: ResolvedTicketRecord
): Promise<void> => {
  const collection = await getResolvedTicketsCollection()

  await collection.deleteOne({ threadId: record.threadId })

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
      $setOnInsert: {
        tickets: [],
      },
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

  const groupedResults = await collection
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

  const legacyResults = await collection
    .aggregate<ResolvedLeaderboardEntry>([
      {
        $match: {
          resolvedByUserId: { $exists: true },
          resolvedAt: {
            $gte: range.start,
            $lte: range.end,
          },
        },
      },
      {
        $group: {
          _id: '$resolvedByUserId',
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
    ])
    .toArray()

  return combineLeaderboardCounts([...groupedResults, ...legacyResults])
}

export const getResolvedTicketsByUser = async (
  userId: string,
  range: AuditDateRange
): Promise<Array<ResolvedTicketRecord>> => {
  const collection = await getResolvedTicketsCollection()

  const [groupedDocRaw, legacyDocsRaw] = await Promise.all([
    collection.findOne({ _id: userId }),
    collection
      .find({
        resolvedByUserId: userId,
        resolvedAt: {
          $gte: range.start,
          $lte: range.end,
        },
      })
      .toArray(),
  ])

  const groupedRecords = isGroupedResolvedTicketDocument(groupedDocRaw)
    ? groupedDocRaw.tickets
        .map((ticket) => toResolvedTicketRecord(ticket, groupedDocRaw._id))
        .filter((ticket): ticket is ResolvedTicketRecord => ticket !== null)
        .filter(
          (ticket) =>
            ticket.resolvedAt >= range.start && ticket.resolvedAt <= range.end
        )
    : []

  const legacyRecords = legacyDocsRaw
    .map((doc) => toResolvedTicketRecord(doc))
    .filter((ticket): ticket is ResolvedTicketRecord => ticket !== null)

  const deduped = new Map<string, ResolvedTicketRecord>()
  for (const ticket of [...legacyRecords, ...groupedRecords]) {
    deduped.set(ticket.threadId, ticket)
  }

  return Array.from(deduped.values()).sort(
    (a, b) => b.resolvedAt.getTime() - a.resolvedAt.getTime()
  )
}

export const migrateLegacyResolvedTickets = async (): Promise<
  ResolvedTicketMigrationResult
> => {
  const collection = await getResolvedTicketsCollection()
  const legacyDocsRaw = await collection
    .find({
      resolvedByUserId: { $exists: true },
      resolvedAt: { $exists: true },
    })
    .toArray()

  const groupedLegacyTickets = new Map<
    string,
    {
      legacyIds: Array<ObjectId>
      tickets: Map<string, GroupedResolvedTicketEntry>
    }
  >()

  let migratedLegacyDocuments = 0
  let skippedLegacyDocuments = 0

  for (const doc of legacyDocsRaw) {
    const normalized = toResolvedTicketRecord(doc)
    if (!normalized || !(doc._id instanceof ObjectId)) {
      skippedLegacyDocuments += 1
      continue
    }

    let userGroup = groupedLegacyTickets.get(normalized.resolvedByUserId)
    if (!userGroup) {
      userGroup = {
        legacyIds: [],
        tickets: new Map<string, GroupedResolvedTicketEntry>(),
      }
      groupedLegacyTickets.set(normalized.resolvedByUserId, userGroup)
    }

    userGroup.legacyIds.push(doc._id)
    mergeTicketEntry(userGroup.tickets, {
      threadId: normalized.threadId,
      threadName: normalized.threadName,
      resolvedAt: normalized.resolvedAt,
    })
    migratedLegacyDocuments += 1
  }

  let groupedUsersUpdated = 0

  for (const [userId, userGroup] of groupedLegacyTickets.entries()) {
    const existingDoc = await collection.findOne({ _id: userId })
    const mergedTickets = new Map<string, GroupedResolvedTicketEntry>()

    if (isGroupedResolvedTicketDocument(existingDoc)) {
      for (const ticket of existingDoc.tickets) {
        const normalizedTicket = toGroupedResolvedTicketEntry(ticket)
        if (!normalizedTicket) continue
        mergeTicketEntry(mergedTickets, normalizedTicket)
      }
    }

    for (const ticket of userGroup.tickets.values()) {
      mergeTicketEntry(mergedTickets, ticket)
    }

    const nextTickets = Array.from(mergedTickets.values()).sort(
      (a, b) => b.resolvedAt.getTime() - a.resolvedAt.getTime()
    )

    await collection.updateOne(
      { _id: userId },
      {
        $set: {
          tickets: nextTickets,
        },
      },
      { upsert: true }
    )

    groupedUsersUpdated += 1
  }

  const legacyIdsToDelete = Array.from(groupedLegacyTickets.values()).flatMap(
    (userGroup) => userGroup.legacyIds
  )

  let deletedLegacyDocuments = 0
  if (legacyIdsToDelete.length > 0) {
    const deleteResult = await collection.deleteMany({
      _id: { $in: legacyIdsToDelete },
    })
    deletedLegacyDocuments = deleteResult.deletedCount ?? 0
  }

  return {
    scannedLegacyDocuments: legacyDocsRaw.length,
    migratedLegacyDocuments,
    skippedLegacyDocuments,
    groupedUsersUpdated,
    deletedLegacyDocuments,
  }
}