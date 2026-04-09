import path from 'node:path'
import * as dotenv from 'dotenv'

import { closeMongoClient } from '../utils/db/mongo'
import { migrateLegacyResolvedTickets } from '../utils/db/resolvedTickets'

dotenv.config({ path: path.join(process.cwd(), '.env') })

const main = async (): Promise<void> => {
  const result = await migrateLegacyResolvedTickets()

  console.log('Resolved audit migration complete.')
  console.log(`Scanned legacy documents: ${result.scannedLegacyDocuments}`)
  console.log(`Migrated legacy documents: ${result.migratedLegacyDocuments}`)
  console.log(`Skipped legacy documents: ${result.skippedLegacyDocuments}`)
  console.log(`Grouped users updated: ${result.groupedUsersUpdated}`)
  console.log(`Deleted legacy documents: ${result.deletedLegacyDocuments}`)
}

void main()
  .catch((error) => {
    console.error('Resolved audit migration failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeMongoClient().catch(() => void 0)
  })