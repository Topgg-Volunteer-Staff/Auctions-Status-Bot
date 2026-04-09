import { Collection, WithId } from 'mongodb'
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

const collectionName =
  process.env.MONGODB_RESOLVED_COLLECTION ?? 'resolvedTicketAudits'

let resolvedTicketsCollectionPromise: Promise<Collection<ResolvedTicketRecord>> | null =
  null

const getResolvedTicketsCollection = async (): Promise<
  Collection<ResolvedTicketRecord>
> => {
  if (!resolvedTicketsCollectionPromise) {
    resolvedTicketsCollectionPromise = (async () => {
      const db = await getMongoDatabase()
      const collection = db.collection<ResolvedTicketRecord>(collectionName)

      await Promise.all([
        collection.createIndex({ threadId: 1 }, { unique: true }),
        collection.createIndex({ resolvedAt: 1 }),
        collection.createIndex({ resolvedByUserId: 1, resolvedAt: 1 }),
      ])

      return collection
    })()
  }

  return resolvedTicketsCollectionPromise
}

export const recordResolvedTicket = async (
  record: ResolvedTicketRecord
): Promise<void> => {
  const collection = await getResolvedTicketsCollection()

  await collection.updateOne(
    { threadId: record.threadId },
    {
      $set: {
        threadName: record.threadName,
        resolvedAt: record.resolvedAt,
        resolvedByUserId: record.resolvedByUserId,
      },
      $setOnInsert: {
        threadId: record.threadId,
      },
    },
    { upsert: true }
  )
}

export const getResolvedLeaderboard = async (
  range: AuditDateRange
): Promise<Array<ResolvedLeaderboardEntry>> => {
  const collection = await getResolvedTicketsCollection()

  const results = await collection
    .aggregate<ResolvedLeaderboardEntry>([
      {
        $match: {
          resolvedAt: {
            $gte: range.start,
            $lte: range.end,
          },
        },
      },
      {
        $sort: {
          resolvedAt: -1,
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
      {
        $sort: {
          count: -1,
          userId: 1,
        },
      },
    ])
    .toArray()

  return results
}

export const getResolvedTicketsByUser = async (
  userId: string,
  range: AuditDateRange
): Promise<Array<WithId<ResolvedTicketRecord>>> => {
  const collection = await getResolvedTicketsCollection()

  return collection
    .find({
      resolvedByUserId: userId,
      resolvedAt: {
        $gte: range.start,
        $lte: range.end,
      },
    })
    .sort({ resolvedAt: -1 })
    .toArray()
}