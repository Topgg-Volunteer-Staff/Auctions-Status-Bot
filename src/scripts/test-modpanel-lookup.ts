// scripts/test-modpanel-lookup.ts
// Usage: npm run test:modpanel -- <discordId> [BOT|SERVER]
import path from 'node:path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import {
  fetchTopggEntityModPanelInfo,
  getTopggModPanelUrl,
} from '../utils/topggTeams'

async function main(): Promise<void> {
  const discordId = process.argv[2] ?? '1515360272360013839'
  const type = process.argv[3] === 'SERVER' ? 'SERVER' : 'BOT'

  if (!process.env.GRAPHQL_API_TOKEN) {
    console.warn(
      'Warning: GRAPHQL_API_TOKEN is not set in .env — the request may be rejected.'
    )
  }

  console.log(`Looking up Top.gg mod panel info for ${type} ${discordId}...`)

  const info = await fetchTopggEntityModPanelInfo(discordId, type)

  if (!info) {
    console.log(`No internal ID found (${type.toLowerCase()} is not listed on Top.gg).`)
    return
  }

  console.log(`Internal ID: ${info.internalId}`)
  console.log(`Review Status: ${info.reviewStatus ?? '(none)'}`)
  console.log(`Modpanel URL: ${getTopggModPanelUrl(info.internalId)}`)
}

main().catch((error: unknown) => {
  console.error('Lookup failed:', error)
  process.exit(1)
})
