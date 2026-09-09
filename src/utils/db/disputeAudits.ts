import { Collection, CreateIndexesOptions } from 'mongodb'
import { getMongoDatabase } from './mongo'

export interface DisputeAuditRecord {
  threadId: string
  threadName: string
  /** True when the dispute existed because the reviewer made a mistake. */
  reviewerMistake: boolean
  answeredByUserId: string
  answeredAt: Date
}

export interface DisputeAuditTotals {
  yes: number
  no: number
}

type DisputeAuditDocument = DisputeAuditRecord & {
  _id: string
}

const collectionName =
  process.env.MONGODB_DISPUTE_AUDITS_COLLECTION ?? 'disputeAudits'

let disputeAuditsCollectionPromise: Promise<
  Collection<DisputeAuditDocument>
> | null = null

const hasEquivalentIndex = async (
  collection: Collection<DisputeAuditDocument>,
  keys: Record<string, 1 | -1>
): Promise<boolean> => {
  try {
    const existingIndexes = await collection.indexes()

    return existingIndexes.some(
      (index) =>
        JSON.stringify(index.key as Record<string, unknown>) ===
        JSON.stringify(keys)
    )
  } catch {
    // Collection doesn't exist yet, no indexes to check
    return false
  }
}

const ensureIndex = async (
  collection: Collection<DisputeAuditDocument>,
  keys: Record<string, 1 | -1>,
  options: CreateIndexesOptions
): Promise<void> => {
  if (await hasEquivalentIndex(collection, keys)) return

  await collection.createIndex(keys, options)
}

const getDisputeAuditsCollection = async (): Promise<
  Collection<DisputeAuditDocument>
> => {
  if (!disputeAuditsCollectionPromise) {
    disputeAuditsCollectionPromise = (async () => {
      const db = await getMongoDatabase()
      const collection = db.collection<DisputeAuditDocument>(collectionName)

      await ensureIndex(
        collection,
        { answeredAt: -1 },
        { name: 'disputeAudits_answeredAt_desc' }
      )

      return collection
    })()
  }

  return disputeAuditsCollectionPromise
}

// Keyed by thread, so re-resolving a dispute overwrites the previous answer
// instead of counting the same ticket twice.
export const recordDisputeAudit = async (
  record: DisputeAuditRecord
): Promise<void> => {
  const collection = await getDisputeAuditsCollection()

  await collection.updateOne(
    { _id: record.threadId },
    {
      $set: {
        threadId: record.threadId,
        threadName: record.threadName,
        reviewerMistake: record.reviewerMistake,
        answeredByUserId: record.answeredByUserId,
        answeredAt: record.answeredAt,
      },
    },
    { upsert: true }
  )
}

export const getDisputeAuditTotals = async (): Promise<DisputeAuditTotals> => {
  const collection = await getDisputeAuditsCollection()

  const [yes, no] = await Promise.all([
    collection.countDocuments({ reviewerMistake: true }),
    collection.countDocuments({ reviewerMistake: false }),
  ])

  return { yes, no }
}
