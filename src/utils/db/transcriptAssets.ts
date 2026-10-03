import { Readable } from 'node:stream'
import { Db, GridFSBucket, GridFSBucketReadStream, ObjectId } from 'mongodb'

import { getMongoDatabase } from './mongo'
import { getTranscriptExpiryCutoff, iterateTranscriptHtml } from './transcripts'

const bucketName =
  process.env.MONGODB_TRANSCRIPT_ASSETS_BUCKET ?? 'transcriptAssets'

let bucketPromise: Promise<GridFSBucket> | null = null

const ASSET_URL_PATTERN = /\/transcript-asset\/([0-9a-f]{24})/g

// Assets uploaded before access control existed have no `metadata.threadId`,
// so there's no way to tell which transcript (and therefore which users) they
// belong to. Recover that by scanning transcript HTML for asset URLs. Any
// asset no transcript references gets `null` so it isn't rescanned on every
// startup — it stays unreachable and ages out with the TTL sweep.
const backfillAssetThreadIds = async (bucketDb: Db): Promise<void> => {
  const files = bucketDb.collection(`${bucketName}.files`)
  const unlinkedFilter = { 'metadata.threadId': { $exists: false } }

  if ((await files.countDocuments(unlinkedFilter, { limit: 1 })) === 0) {
    return
  }

  for await (const { threadId, transcriptHtml } of iterateTranscriptHtml()) {
    const assetIds = [...transcriptHtml.matchAll(ASSET_URL_PATTERN)].map(
      (match) => new ObjectId(match[1])
    )
    if (assetIds.length === 0) continue

    await files.updateMany(
      { _id: { $in: assetIds }, ...unlinkedFilter },
      { $set: { 'metadata.threadId': threadId } }
    )
  }

  await files.updateMany(unlinkedFilter, { $set: { 'metadata.threadId': null } })
}

const getBucket = async (): Promise<GridFSBucket> => {
  if (!bucketPromise) {
    bucketPromise = (async () => {
      const db = await getMongoDatabase()
      await backfillAssetThreadIds(db)
      return new GridFSBucket(db, { bucketName })
    })()
    bucketPromise.catch(() => {
      bucketPromise = null
    })
  }

  return bucketPromise
}

export interface StoredTranscriptAsset {
  id: string
  filename: string
  contentType: string
}

export interface TranscriptAssetDownload {
  stream: GridFSBucketReadStream
  contentType: string
  filename: string
  length: number
  /** Ticket thread the asset was uploaded for; null if it can't be tied to one. */
  threadId: string | null
}

/**
 * Uploads a file's bytes to GridFS so a transcript can link to a permanent,
 * self-hosted URL instead of a Discord CDN URL that will eventually expire.
 */
export const storeTranscriptAsset = async (
  buffer: Buffer,
  filename: string,
  contentType: string,
  threadId: string
): Promise<StoredTranscriptAsset> => {
  const bucket = await getBucket()
  const id = new ObjectId()

  await new Promise<void>((resolve, reject) => {
    // threadId ties the asset to its transcript so the web server can apply
    // the same access check to it as to the transcript page.
    const uploadStream = bucket.openUploadStreamWithId(id, filename, {
      contentType,
      metadata: { threadId },
    })

    Readable.from(buffer)
      .pipe(uploadStream)
      .on('error', reject)
      .on('finish', () => resolve())
  })

  return { id: id.toHexString(), filename, contentType }
}

export const openTranscriptAssetDownloadStream = async (
  assetId: string
): Promise<TranscriptAssetDownload | null> => {
  let objectId: ObjectId

  try {
    objectId = new ObjectId(assetId)
  } catch {
    return null
  }

  const bucket = await getBucket()
  const files = await bucket.find({ _id: objectId }).toArray()
  const file = files[0]
  if (!file) return null

  return {
    stream: bucket.openDownloadStream(objectId),
    contentType:
      (file.contentType as string | undefined) ?? 'application/octet-stream',
    filename: file.filename,
    length: file.length,
    threadId:
      typeof file.metadata?.threadId === 'string' ? file.metadata.threadId : null,
  }
}

/**
 * Assets are uploaded when their transcript is generated, so anything older
 * than the transcript TTL belongs to an expired (or orphaned) transcript.
 */
export const deleteExpiredTranscriptAssets = async (): Promise<number> => {
  const bucket = await getBucket()
  const expired = await bucket
    .find(
      { uploadDate: { $lt: getTranscriptExpiryCutoff() } },
      { projection: { _id: 1 } }
    )
    .toArray()

  for (const file of expired) {
    await bucket.delete(file._id)
  }

  return expired.length
}
