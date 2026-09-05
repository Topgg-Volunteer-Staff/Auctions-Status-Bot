import { Collection, CreateIndexesOptions } from 'mongodb'
import { getMongoDatabase } from './mongo'

export interface StoredTranscript {
  threadId: string
  threadName: string
  userId: string
  transcriptHtml: string
  generatedAt: Date
  resolvedAt: Date
  resolvedBy: string
  isModTicket: boolean
}

type TranscriptDocument = {
  _id: string
  transcripts: Array<Omit<StoredTranscript, 'userId'>>
}

const collectionName =
  process.env.MONGODB_TRANSCRIPTS_COLLECTION ?? 'ticketTranscripts'

let transcriptsCollectionPromise: Promise<Collection<TranscriptDocument>> | null =
  null

const hasEquivalentIndex = async (
  collection: Collection<TranscriptDocument>,
  keys: Record<string, 1 | -1>,
  options: CreateIndexesOptions
): Promise<boolean> => {
  try {
    const existingIndexes = await collection.indexes()

    return existingIndexes.some((index) => {
      const indexKeys = index.key as Record<string, unknown>
      const indexPartialFilter = ('partialFilterExpression' in index
        ? index.partialFilterExpression
        : null) ?? null

      return (
        JSON.stringify(indexKeys) === JSON.stringify(keys) &&
        JSON.stringify(indexPartialFilter) ===
          JSON.stringify(options.partialFilterExpression ?? null) &&
        index.unique === (options.unique === true)
      )
    })
  } catch {
    // Collection doesn't exist yet, no indexes to check
    return false
  }
}

const ensureIndex = async (
  collection: Collection<TranscriptDocument>,
  keys: Record<string, 1 | -1>,
  options: CreateIndexesOptions
): Promise<void> => {
  if (await hasEquivalentIndex(collection, keys, options)) {
    return
  }

  await collection.createIndex(keys, options)
}

const getTranscriptsCollection = async (): Promise<
  Collection<TranscriptDocument>
> => {
  if (!transcriptsCollectionPromise) {
    transcriptsCollectionPromise = (async () => {
      const db = await getMongoDatabase()
      const collection = db.collection<TranscriptDocument>(collectionName)

      await ensureIndex(collection, { 'transcripts.threadId': 1 }, {
        name: 'transcripts_threadId_unique',
        unique: true,
        partialFilterExpression: {
          'transcripts.threadId': { $exists: true },
        },
      })

      await ensureIndex(collection, { 'transcripts.generatedAt': -1 }, {
        name: 'transcripts_generatedAt_desc',
        partialFilterExpression: {
          'transcripts.generatedAt': { $exists: true },
        },
      })

      return collection
    })()
  }

  return transcriptsCollectionPromise
}

export const saveTranscript = async (
  transcript: StoredTranscript
): Promise<void> => {
  const collection = await getTranscriptsCollection()

  await collection.updateOne(
    { _id: transcript.userId },
    {
      $setOnInsert: {
        transcripts: [],
      },
    },
    { upsert: true }
  )

  // Remove old transcript for same thread if it exists
  await collection.updateOne(
    { _id: transcript.userId },
    {
      $pull: {
        transcripts: {
          threadId: transcript.threadId,
        },
      },
    }
  )

  // Add new transcript
  await collection.updateOne(
    { _id: transcript.userId },
    {
      $push: {
        transcripts: {
          threadId: transcript.threadId,
          threadName: transcript.threadName,
          transcriptHtml: transcript.transcriptHtml,
          generatedAt: transcript.generatedAt,
          resolvedAt: transcript.resolvedAt,
          resolvedBy: transcript.resolvedBy,
          isModTicket: transcript.isModTicket,
        },
      },
    }
  )
}

export const getUserTranscripts = async (
  userId: string
): Promise<Array<StoredTranscript>> => {
  const collection = await getTranscriptsCollection()

  const doc = await collection.findOne({ _id: userId })
  if (!doc) return []

  return (doc.transcripts ?? []).map((t) => ({
    ...t,
    userId,
  }))
}

export const getTranscript = async (
  threadId: string
): Promise<StoredTranscript | null> => {
  const collection = await getTranscriptsCollection()

  const doc = await collection.findOne({
    'transcripts.threadId': threadId,
  })

  if (!doc) return null

  const transcript = doc.transcripts.find((t) => t.threadId === threadId)
  if (!transcript) return null

  return {
    ...transcript,
    userId: doc._id,
  }
}
