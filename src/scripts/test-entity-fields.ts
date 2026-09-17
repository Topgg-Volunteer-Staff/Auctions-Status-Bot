// scripts/test-entity-fields.ts
// Usage: npm run test:entity-fields -- <discordId> [BOT|SERVER]
// Probes speculative fields on entityExternal (icon/avatar/name) without touching
// the production query, so we can find the right field name for server icons.
import path from 'node:path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(process.cwd(), '.env') })

import { topggGraphql } from '../utils/topggTeams'

const PROBE_QUERY = `
  query EntityFieldsProbe($id: String!, $platform: Platform!, $type: EntityType!) {
    entityExternal(externalId: $id, platform: $platform, type: $type) {
      internalId: id
      reviewStatus
      name
      icon
      iconUrl
    }
  }
`

async function main(): Promise<void> {
  const discordId = process.argv[2] ?? '1515360272360013839'
  const type = process.argv[3] === 'SERVER' ? 'SERVER' : 'BOT'

  if (!process.env.GRAPHQL_API_TOKEN) {
    console.warn(
      'Warning: GRAPHQL_API_TOKEN is not set in .env — the request may be rejected.'
    )
  }

  console.log(`Probing entityExternal fields for ${type} ${discordId}...`)

  try {
    const data = await topggGraphql(PROBE_QUERY, {
      id: discordId,
      platform: 'DISCORD',
      type,
    })
    console.log(JSON.stringify(data, null, 2))
  } catch (error) {
    console.error('Probe failed:', error)
  }
}

main().catch((error: unknown) => {
  console.error('Probe failed:', error)
  process.exit(1)
})
