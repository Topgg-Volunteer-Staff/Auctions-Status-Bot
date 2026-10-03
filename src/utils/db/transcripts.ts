import { randomUUID } from 'node:crypto'
import { Collection, CreateIndexesOptions } from 'mongodb'
import { getMongoDatabase } from './mongo'

export interface StoredTranscript {
  threadId: string
  threadName: string
  userId: string
  transcriptHtml: string
  transcriptId: string
  generatedAt: Date
  resolvedAt: Date
  resolvedBy: string
  isModTicket: boolean
  /**
   * Everyone who spoke in the ticket, used to gate the hosted transcript.
   * Missing on transcripts saved before access control existed.
   */
  participantIds?: Array<string>
}

export type SaveTranscriptInput = Omit<
  StoredTranscript,
  'transcriptId' | 'participantIds'
> & { participantIds: Array<string> }

export const TRANSCRIPT_TTL_DAYS = 90
export const TRANSCRIPT_TTL_MS = TRANSCRIPT_TTL_DAYS * 24 * 60 * 60 * 1000

export const getTranscriptExpiresAt = (resolvedAt: Date): Date =>
  new Date(resolvedAt.getTime() + TRANSCRIPT_TTL_MS)

export const getTranscriptExpiryCutoff = (now = new Date()): Date =>
  new Date(now.getTime() - TRANSCRIPT_TTL_MS)

// The sweep only runs periodically, so reads also hide anything past its TTL
// to make expiry exact rather than "up to an hour late".
const isTranscriptExpired = (
  transcript: Pick<StoredTranscript, 'resolvedAt'>
): boolean => transcript.resolvedAt.getTime() < getTranscriptExpiryCutoff().getTime()

type TranscriptDocument = {
  _id: string
  transcripts: Array<Omit<StoredTranscript, 'userId'>>
}

const collectionName =
  process.env.MONGODB_TRANSCRIPTS_COLLECTION ?? 'ticketTranscripts'

let transcriptsCollectionPromise: Promise<Collection<TranscriptDocument>> | null =
  null

const generateTranscriptId = (): string => randomUUID()

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

// Transcripts saved before `transcriptId` existed have array entries missing
// that field. Mongo's `transcripts.transcriptId: { $exists: true }` partial
// filter matches a document if ANY element has the field, but the multikey
// index still generates a `null` entry for elements that don't — so once a
// user has one old (fieldless) transcript and one new one, their document
// gets indexed and produces a `null` key. Two such users collide on that
// same `null` slot in the unique index. Backfilling a real id onto every
// legacy entry removes all `null` keys so this can't happen again.
const backfillMissingTranscriptIds = async (
  collection: Collection<TranscriptDocument>
): Promise<void> => {
  const cursor = collection.find({
    transcripts: { $elemMatch: { transcriptId: { $exists: false } } },
  })

  for await (const doc of cursor) {
    const fixedTranscripts = doc.transcripts.map((t) =>
      t.transcriptId ? t : { ...t, transcriptId: generateTranscriptId() }
    )

    await collection.updateOne(
      { _id: doc._id },
      { $set: { transcripts: fixedTranscripts } }
    )
  }
}

const getTranscriptsCollection = async (): Promise<
  Collection<TranscriptDocument>
> => {
  if (!transcriptsCollectionPromise) {
    transcriptsCollectionPromise = (async () => {
      const db = await getMongoDatabase()
      const collection = db.collection<TranscriptDocument>(collectionName)

      await backfillMissingTranscriptIds(collection)

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

      await ensureIndex(collection, { 'transcripts.transcriptId': 1 }, {
        name: 'transcripts_transcriptId_unique',
        unique: true,
        partialFilterExpression: {
          'transcripts.transcriptId': { $exists: true },
        },
      })

      return collection
    })()
  }

  return transcriptsCollectionPromise
}

export const saveTranscript = async (
  transcript: SaveTranscriptInput
): Promise<string> => {
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

  // Add new transcript. Upsert in case the expiry sweep deleted the (now
  // empty) user document between the steps above.
  const transcriptId = generateTranscriptId()
  await collection.updateOne(
    { _id: transcript.userId },
    {
      $push: {
        transcripts: {
          threadId: transcript.threadId,
          threadName: transcript.threadName,
          transcriptHtml: transcript.transcriptHtml,
          transcriptId,
          generatedAt: transcript.generatedAt,
          resolvedAt: transcript.resolvedAt,
          resolvedBy: transcript.resolvedBy,
          isModTicket: transcript.isModTicket,
          participantIds: transcript.participantIds,
        },
      },
    },
    { upsert: true }
  )

  return transcriptId
}

/**
 * Removes every transcript older than the TTL. Transcripts live in an array
 * per user, so a Mongo TTL index can't be used — it would expire the whole
 * user document (all of their transcripts) once the oldest one aged out.
 */
export const deleteExpiredTranscripts = async (): Promise<number> => {
  const collection = await getTranscriptsCollection()
  const cutoff = getTranscriptExpiryCutoff()

  const result = await collection.updateMany(
    { 'transcripts.resolvedAt': { $lt: cutoff } },
    { $pull: { transcripts: { resolvedAt: { $lt: cutoff } } } }
  )

  await collection.deleteMany({ transcripts: { $size: 0 } })

  return result.modifiedCount
}

/** Streams every non-expired transcript's thread ID and HTML. */
export async function* iterateTranscriptHtml(): AsyncGenerator<{
  threadId: string
  transcriptHtml: string
}> {
  const collection = await getTranscriptsCollection()
  const cursor = collection.find(
    {},
    {
      projection: {
        'transcripts.threadId': 1,
        'transcripts.transcriptHtml': 1,
        'transcripts.resolvedAt': 1,
      },
    }
  )

  for await (const doc of cursor) {
    for (const t of doc.transcripts) {
      if (isTranscriptExpired(t)) continue
      yield { threadId: t.threadId, transcriptHtml: t.transcriptHtml }
    }
  }
}

export const getUserTranscripts = async (
  userId: string
): Promise<Array<StoredTranscript>> => {
  const collection = await getTranscriptsCollection()

  const doc = await collection.findOne({ _id: userId })
  if (!doc) return []

  return (doc.transcripts ?? [])
    .filter((t) => !isTranscriptExpired(t))
    .map((t) => ({
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
  if (!transcript || isTranscriptExpired(transcript)) return null

  return {
    ...transcript,
    userId: doc._id,
  }
}

export const getTranscriptById = async (
  transcriptId: string
): Promise<StoredTranscript | null> => {
  const collection = await getTranscriptsCollection()

  const doc = await collection.findOne({
    'transcripts.transcriptId': transcriptId,
  })

  if (!doc) return null

  const transcript = doc.transcripts.find((t) => t.transcriptId === transcriptId)
  if (!transcript || isTranscriptExpired(transcript)) return null

  return {
    ...transcript,
    userId: doc._id,
  }
}
