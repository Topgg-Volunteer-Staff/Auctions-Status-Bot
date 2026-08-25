// scripts/test-modpanel-lookup.ts
// Usage: npm run test:modpanel -- <discordBotId>
import path from 'node:path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import {
  fetchTopggBotInternalId,
  getTopggModPanelUrl,
} from '../utils/topggTeams'

async function main(): Promise<void> {
  const botId = process.argv[2] ?? '1515360272360013839'

  if (!process.env.GRAPHQL_API_TOKEN) {
    console.warn(
      'Warning: GRAPHQL_API_TOKEN is not set in .env — the request may be rejected.'
    )
  }

  console.log(`Looking up Top.gg internal ID for bot ${botId}...`)

  const internalId = await fetchTopggBotInternalId(botId)

  if (!internalId) {
    console.log('No internal ID found (bot is not listed on Top.gg).')
    return
  }

  console.log(`Internal ID: ${internalId}`)
  console.log(`Modpanel URL: ${getTopggModPanelUrl(internalId)}`)
}

main().catch((error: unknown) => {
  console.error('Lookup failed:', error)
  process.exit(1)
})
