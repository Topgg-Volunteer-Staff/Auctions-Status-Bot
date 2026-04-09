import { Client } from 'discord.js'
import { readFile } from 'node:fs/promises'

import { sendErrorLog } from '../errorLogging'
import { getMongoDatabase } from './mongo'

type MongoBackedStoreDocument = {
  _id: string
  data: unknown
  updatedAt: Date
}

type SaveOptions = {
  legacyFilePath?: string
  operation?: string
}

const COLLECTION_NAME = 'appData'

let mongoStoreErrorClient: Client | null = null

const getCollection = async () =>
  (await getMongoDatabase()).collection<MongoBackedStoreDocument>(
    COLLECTION_NAME
  )

export const setMongoStoreErrorClient = (client: Client): void => {
  mongoStoreErrorClient = client
}

const reportWriteFailure = async (
  storeKey: string,
  error: unknown,
  options?: SaveOptions
): Promise<void> => {
  console.error(`[mongo-store] Failed to write ${storeKey}:`, error)

  if (!mongoStoreErrorClient) return

  await sendErrorLog(
    mongoStoreErrorClient,
    'mongoStore.write.failed',
    error,
    {
      storeKey,
      operation: options?.operation ?? 'write',
      legacyFilePath: options?.legacyFilePath,
    }
  ).catch(() => void 0)
}

export const saveMongoBackedJson = async <T>(
  storeKey: string,
  value: T,
  options?: SaveOptions
): Promise<void> => {
  try {
    const collection = await getCollection()
    await collection.updateOne(
      { _id: storeKey },
      {
        $set: {
          data: value,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    )
  } catch (error) {
    await reportWriteFailure(storeKey, error, options)
    throw error
  }
}

export const loadMongoBackedJson = async <T>(
  storeKey: string,
  legacyFilePath: string,
  defaultValue: T
): Promise<T> => {
  try {
    const collection = await getCollection()
    const existing = await collection.findOne({ _id: storeKey })

    if (existing && 'data' in existing) {
      return existing.data as T
    }
  } catch (error) {
    console.error(`[mongo-store] Failed to read ${storeKey} from MongoDB:`, error)
  }

  try {
    const raw = await readFile(legacyFilePath, 'utf8')
    const parsed = JSON.parse(raw) as T

    await saveMongoBackedJson(storeKey, parsed, {
      legacyFilePath,
      operation: 'migrate-legacy-json',
    }).catch(() => void 0)

    return parsed
  } catch (error) {
    const maybe = error as { code?: unknown }
    if (maybe.code !== 'ENOENT') {
      console.error(`[mongo-store] Failed to load ${storeKey}:`, error)
    }

    return defaultValue
  }
}