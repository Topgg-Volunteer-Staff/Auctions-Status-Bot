import { Db, MongoClient } from 'mongodb'

const fallbackDatabaseName = 'top-gg-tickets'

let mongoClientPromise: Promise<MongoClient> | null = null

const getMongoUri = (): string => {
  const uri =
    process.env.MONGODB_URI ??
    process.env.MONGO_URI ??
    process.env.MONGODB_CONNECTION_STRING ??
    process.env.MONGODB ??
    ''

  if (!uri.trim()) {
    throw new Error(
      'MongoDB connection string is missing. Set MONGODB_URI, MONGO_URI, MONGODB_CONNECTION_STRING, or MONGODB in the environment.'
    )
  }

  return uri.trim()
}

const inferDatabaseName = (uri: string): string => {
  const explicitName =
    process.env.MONGODB_DB_NAME ?? process.env.MONGO_DB_NAME ?? ''

  if (explicitName.trim()) {
    return explicitName.trim()
  }

  try {
    const parsed = new URL(uri)
    const pathname = parsed.pathname.replace(/^\//, '').trim()
    return pathname || fallbackDatabaseName
  } catch {
    return fallbackDatabaseName
  }
}

const getMongoClient = async (): Promise<MongoClient> => {
  if (!mongoClientPromise) {
    mongoClientPromise = MongoClient.connect(getMongoUri())
  }

  return mongoClientPromise
}

export const getMongoDatabase = async (): Promise<Db> => {
  const uri = getMongoUri()
  const client = await getMongoClient()
  return client.db(inferDatabaseName(uri))
}