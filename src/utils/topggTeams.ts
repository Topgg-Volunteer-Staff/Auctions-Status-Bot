import type { Client } from 'discord.js'

const TOPGG_GRAPHQL_URL = 'https://api.top.gg/graphql'
const TOPGG_REQUEST_TIMEOUT_MS = 10_000
const TOPGG_CACHE_TTL_MS = 60_000

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{
    message: string
    path?: Array<string | number>
  }>
}

export interface TopggEntity {
  id: string
  name: string
  platform: string
  type: string
}

export interface TopggUserTeam {
  members: Array<{
    userId: string
    role: string
  }>
  entities: Array<TopggEntity>
}

export interface TopggBotTeam {
  members: Array<{
    user: {
      id: string
      username: string
    }
  }>
}

export interface TopggBotOwner {
  id: string
  username: string
}

export type TopggLookupErrorKind =
  | 'http'
  | 'graphql'
  | 'cloudflare'
  | 'invalid-response'
  | 'network'
  | 'timeout'

export class TopggLookupError extends Error {
  public readonly kind: TopggLookupErrorKind

  public constructor(kind: TopggLookupErrorKind, message: string) {
    super(message)
    this.name = 'TopggLookupError'
    this.kind = kind
  }
}

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

const userTeamCache = new Map<string, CacheEntry<Array<TopggUserTeam>>>()
const botOwnershipCache = new Map<
  string,
  CacheEntry<{
    owners: Array<TopggBotOwner>
    team: TopggBotTeam | null
  }>
>()

const USER_TEAMS_QUERY = `
  query UserTeams($id: String!) {
    user(id: $id) {
      teams {
        members {
          userId
          role
        }
        entities {
          id
          name
          platform
          type
        }
      }
    }
  }
`

const BOT_TEAM_QUERY = `
  query BotTeam($id: String!) {
    discordBot(externalId: $id) {
      owners {
        id
        username
      }
      team {
        members {
          user {
            id
            username
          }
        }
      }
    }
  }
`

const isCloudflareChallenge = (body: string): boolean => {
  const normalizedBody = body.toLowerCase()
  return (
    normalizedBody.includes('just a moment') ||
    normalizedBody.includes('cf-chl') ||
    normalizedBody.includes('challenge-platform')
  )
}

const getCached = <T>(
  cache: Map<string, CacheEntry<T>>,
  id: string
): T | null => {
  const cached = cache.get(id)
  if (!cached) return null

  if (cached.expiresAt <= Date.now()) {
    cache.delete(id)
    return null
  }

  return cached.value
}

const setCached = <T>(
  cache: Map<string, CacheEntry<T>>,
  id: string,
  value: T
): void => {
  cache.set(id, {
    expiresAt: Date.now() + TOPGG_CACHE_TTL_MS,
    value,
  })
}

export function validateDiscordId(input: string): string {
  const normalizedId = input.trim().replace(/^<@!?(\d+)>$/, '$1')

  if (!/^\d{17,20}$/.test(normalizedId)) {
    throw new Error('The supplied value is not a valid Discord user or bot ID')
  }

  return normalizedId
}

export function getTopggBotUrl(discordBotId: string): string {
  return `https://top.gg/bot/${validateDiscordId(discordBotId)}`
}

export async function topggGraphql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'Top-GG-Tickets/1.0 (+https://top.gg)',
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TOPGG_REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(TOPGG_GRAPHQL_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new TopggLookupError('timeout', 'Top.gg GraphQL request timed out')
    }

    throw new TopggLookupError(
      'network',
      `Top.gg GraphQL request failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  } finally {
    clearTimeout(timeout)
  }

  const contentType = response.headers.get('content-type') ?? ''
  const responseText = await response.text().catch(() => '')

  if (isCloudflareChallenge(responseText)) {
    throw new TopggLookupError(
      'cloudflare',
      'Top.gg returned a Cloudflare challenge instead of GraphQL JSON'
    )
  }

  if (!response.ok) {
    throw new TopggLookupError(
      'http',
      `Top.gg GraphQL returned HTTP ${response.status}${
        responseText ? `: ${responseText.slice(0, 300)}` : ''
      }`
    )
  }

  if (!contentType.toLowerCase().includes('application/json')) {
    throw new TopggLookupError(
      'invalid-response',
      `Top.gg returned an unexpected content type: ${contentType || 'unknown'}`
    )
  }

  let result: GraphQLResponse<T>
  try {
    result = JSON.parse(responseText) as GraphQLResponse<T>
  } catch {
    throw new TopggLookupError(
      'invalid-response',
      'Top.gg returned invalid GraphQL JSON'
    )
  }

  if (result.errors?.length) {
    throw new TopggLookupError(
      'graphql',
      `Top.gg GraphQL error: ${result.errors
        .map((error) => error.message)
        .join('; ')}`
    )
  }

  if (!result.data) {
    throw new TopggLookupError(
      'invalid-response',
      'Top.gg GraphQL returned no data'
    )
  }

  return result.data
}

export async function fetchTopggUserTeams(
  discordUserId: string
): Promise<Array<TopggUserTeam>> {
  const id = validateDiscordId(discordUserId)
  const cached = getCached(userTeamCache, id)
  if (cached) return cached

  const data = await topggGraphql<{
    user: {
      teams?: Array<TopggUserTeam>
    } | null
  }>(USER_TEAMS_QUERY, { id })

  const teams = data.user?.teams ?? []
  setCached(userTeamCache, id, teams)
  return teams
}

export async function fetchTopggBotOwnership(discordBotId: string): Promise<{
  owners: Array<TopggBotOwner>
  team: TopggBotTeam | null
}> {
  const id = validateDiscordId(discordBotId)
  const cached = getCached(botOwnershipCache, id)
  if (cached) return cached

  const data = await topggGraphql<{
    discordBot: {
      owners?: Array<TopggBotOwner>
      team?: TopggBotTeam | null
    } | null
  }>(BOT_TEAM_QUERY, { id })

  const ownership = {
    owners: data.discordBot?.owners ?? [],
    team: data.discordBot?.team ?? null,
  }
  setCached(botOwnershipCache, id, ownership)
  return ownership
}

export async function fetchTopggTeamsForDiscordId(
  client: Client,
  input: string
): Promise<
  | {
      type: 'user'
      id: string
      username: string
      teams: Array<TopggUserTeam>
    }
  | {
      type: 'bot'
      id: string
      username: string
      owners: Array<TopggBotOwner>
      team: TopggBotTeam | null
    }
> {
  const id = validateDiscordId(input)
  const discordUser = await client.users.fetch(id, { force: true })

  if (discordUser.bot) {
    const ownership = await fetchTopggBotOwnership(id)
    return {
      type: 'bot',
      id,
      username: discordUser.username,
      owners: ownership.owners,
      team: ownership.team,
    }
  }

  return {
    type: 'user',
    id,
    username: discordUser.username,
    teams: await fetchTopggUserTeams(id),
  }
}

export function clearTopggTeamCache(): void {
  userTeamCache.clear()
  botOwnershipCache.clear()
}
