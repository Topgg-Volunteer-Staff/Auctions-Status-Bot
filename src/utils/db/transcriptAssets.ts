import { Readable } from 'node:stream'
import { GridFSBucket, GridFSBucketReadStream, ObjectId } from 'mongodb'

import { getMongoDatabase } from './mongo'

const bucketName =
  process.env.MONGODB_TRANSCRIPT_ASSETS_BUCKET ?? 'transcriptAssets'

let bucketPromise: Promise<GridFSBucket> | null = null

const getBucket = async (): Promise<GridFSBucket> => {
  if (!bucketPromise) {
    bucketPromise = getMongoDatabase().then(
      (db) => new GridFSBucket(db, { bucketName })
    )
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
}

/**
 * Uploads a file's bytes to GridFS so a transcript can link to a permanent,
 * self-hosted URL instead of a Discord CDN URL that will eventually expire.
 */
export const storeTranscriptAsset = async (
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<StoredTranscriptAsset> => {
  const bucket = await getBucket()
  const id = new ObjectId()

  await new Promise<void>((resolve, reject) => {
    const uploadStream = bucket.openUploadStreamWithId(id, filename, {
      contentType,
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
  }
}
