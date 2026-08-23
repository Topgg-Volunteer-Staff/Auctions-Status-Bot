/* eslint-disable @typescript-eslint/no-var-requires */
require('./jasmine/reporter')

const {
  TopggLookupError,
  clearTopggTeamCache,
  fetchTopggBotOwnership,
  fetchTopggTeamsForDiscordId,
  fetchTopggUserTeams,
  getTopggTeamUrl,
  isTopggUserOnBotTeam,
  topggGraphql,
  validateDiscordId,
} = require('../dist/utils/topggTeams')

const USER_ID = '123456789012345678'
const BOT_ID = '223456789012345678'
const TEAM_ID = '01HZXTEAMINTERNALID'

function graphqlResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Top.gg team lookups', () => {
  const originalFetch = global.fetch
  const originalGraphqlToken = process.env.GRAPHQL_API_TOKEN

  beforeEach(() => {
    clearTopggTeamCache()
    global.fetch = jasmine.createSpy('fetch')
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalGraphqlToken === undefined) {
      delete process.env.GRAPHQL_API_TOKEN
    } else {
      process.env.GRAPHQL_API_TOKEN = originalGraphqlToken
    }
  })

  it('returns all teams for a normal Discord user', async () => {
    const teams = [
      {
        members: [{ userId: USER_ID, role: 'ADMIN' }],
        entities: [
          {
            id: BOT_ID,
            name: 'Example Bot',
            platform: 'DISCORD',
            type: 'BOT',
          },
        ],
      },
    ]
    global.fetch.and.resolveTo(graphqlResponse({ data: { user: { teams } } }))

    expect(await fetchTopggUserTeams(USER_ID)).toEqual(teams)
  })

  it('treats a user with no teams as a valid empty result', async () => {
    global.fetch.and.resolveTo(
      graphqlResponse({ data: { user: { teams: [] } } })
    )

    expect(await fetchTopggUserTeams(USER_ID)).toEqual([])
  })

  it('authorizes a user when one of their teams contains the disputed bot', async () => {
    global.fetch.and.resolveTo(
      graphqlResponse({
        data: {
          user: {
            teams: [
              {
                members: [{ userId: 'topgg-user-id', role: 'VIEWER' }],
                entities: [
                  {
                    id: BOT_ID,
                    name: 'Example Bot',
                    platform: 'DISCORD',
                    type: 'BOT',
                  },
                ],
              },
            ],
          },
        },
      })
    )

    expect(await isTopggUserOnBotTeam(USER_ID, BOT_ID)).toBeTrue()
  })

  it("does not authorize a user whose teams don't contain the disputed bot", async () => {
    global.fetch.and.resolveTo(
      graphqlResponse({
        data: {
          user: {
            teams: [
              {
                members: [],
                entities: [
                  {
                    id: '323456789012345678',
                    name: 'Another Bot',
                    platform: 'DISCORD',
                    type: 'BOT',
                  },
                ],
              },
            ],
          },
        },
      })
    )

    expect(await isTopggUserOnBotTeam(USER_ID, BOT_ID)).toBeFalse()
  })

  it('correlates bot and user teams through their internal member IDs', async () => {
    global.fetch.and.resolveTo(
      graphqlResponse({
        data: {
          user: {
            teams: [
              {
                members: [
                  { userId: 'internal-owner-id', role: 'OWNER' },
                  { userId: 'internal-member-id', role: 'VIEWER' },
                ],
                entities: [
                  {
                    id: 'internal-project-id',
                    name: 'Example Bot',
                    platform: 'DISCORD',
                    type: 'BOT',
                  },
                ],
              },
            ],
          },
        },
      })
    )
    const botTeam = {
      id: TEAM_ID,
      members: [
        { user: { id: 'internal-member-id', username: 'member' } },
        { user: { id: 'internal-owner-id', username: 'owner' } },
      ],
    }

    expect(await isTopggUserOnBotTeam(USER_ID, BOT_ID, botTeam)).toBeTrue()
  })

  it('does not authorize teams with only a partial member overlap', async () => {
    global.fetch.and.resolveTo(
      graphqlResponse({
        data: {
          user: {
            teams: [
              {
                members: [
                  { userId: 'internal-member-id', role: 'VIEWER' },
                  { userId: 'different-member-id', role: 'VIEWER' },
                ],
                entities: [],
              },
            ],
          },
        },
      })
    )
    const botTeam = {
      id: TEAM_ID,
      members: [
        { user: { id: 'internal-owner-id', username: 'owner' } },
        { user: { id: 'internal-member-id', username: 'member' } },
      ],
    }

    expect(await isTopggUserOnBotTeam(USER_ID, BOT_ID, botTeam)).toBeFalse()
  })

  it('returns the owning team and its members for a listed bot', async () => {
    const ownership = {
      owners: [{ id: USER_ID, username: 'owner' }],
      team: {
        id: TEAM_ID,
        members: [{ user: { id: USER_ID, username: 'owner' } }],
      },
    }
    global.fetch.and.resolveTo(
      graphqlResponse({ data: { bot: ownership } })
    )

    expect(await fetchTopggBotOwnership(BOT_ID)).toEqual(ownership)
    const requestBody = JSON.parse(global.fetch.calls.mostRecent().args[1].body)
    expect(requestBody.query).toMatch(/team\s*{\s*id\s+members/)
    expect(global.fetch.calls.mostRecent().args[1].headers).toEqual(
      jasmine.objectContaining({
        'User-Agent': 'Top-GG-Tickets/1.0 (+https://top.gg)',
      })
    )
  })

  it('sends a configured GraphQL token as a Bearer token', async () => {
    process.env.GRAPHQL_API_TOKEN = 'test-graphql-token'
    global.fetch.and.resolveTo(
      graphqlResponse({
        data: { bot: { owners: [], team: null } },
      })
    )

    await fetchTopggBotOwnership(BOT_ID)

    expect(global.fetch.calls.mostRecent().args[1].headers).toEqual(
      jasmine.objectContaining({
        Authorization: 'Bearer test-graphql-token',
      })
    )
  })

  it('returns direct owners and a null team for a directly owned bot', async () => {
    global.fetch.and.resolveTo(
      graphqlResponse({
        data: {
          bot: {
            owners: [{ id: USER_ID, username: 'owner' }],
            team: null,
          },
        },
      })
    )

    expect(await fetchTopggBotOwnership(BOT_ID)).toEqual({
      owners: [{ id: USER_ID, username: 'owner' }],
      team: null,
    })
  })

  it('builds a direct team URL from the internal GraphQL ID', () => {
    expect(getTopggTeamUrl(`  ${TEAM_ID}  `)).toBe(
      `https://top.gg/team/${TEAM_ID}`
    )
    expect(getTopggTeamUrl('team/id')).toBe('https://top.gg/team/team%2Fid')
    expect(() => getTopggTeamUrl('   ')).toThrowError(
      'The supplied Top.gg team ID is empty'
    )
  })

  it('returns an empty ownership result when a valid bot is not on Top.gg', async () => {
    global.fetch.and.resolveTo(graphqlResponse({ data: { bot: null } }))

    expect(await fetchTopggBotOwnership(BOT_ID)).toEqual({
      owners: [],
      team: null,
    })
  })

  it('uses Discord to select the bot lookup', async () => {
    global.fetch.and.resolveTo(
      graphqlResponse({
        data: {
          bot: {
            owners: [{ id: USER_ID, username: 'owner' }],
            team: null,
          },
        },
      })
    )
    const client = {
      users: {
        fetch: jasmine
          .createSpy('users.fetch')
          .and.resolveTo({ bot: true, username: 'Example Bot' }),
      },
    }

    expect(await fetchTopggTeamsForDiscordId(client, BOT_ID)).toEqual({
      type: 'bot',
      id: BOT_ID,
      username: 'Example Bot',
      owners: [{ id: USER_ID, username: 'owner' }],
      team: null,
    })
    expect(client.users.fetch).toHaveBeenCalledWith(BOT_ID, { force: true })
  })

  it('uses Discord to select the normal user lookup', async () => {
    global.fetch.and.resolveTo(
      graphqlResponse({ data: { user: { teams: [] } } })
    )
    const client = {
      users: {
        fetch: jasmine
          .createSpy('users.fetch')
          .and.resolveTo({ bot: false, username: 'Example User' }),
      },
    }

    expect(await fetchTopggTeamsForDiscordId(client, USER_ID)).toEqual({
      type: 'user',
      id: USER_ID,
      username: 'Example User',
      teams: [],
    })
    expect(client.users.fetch).toHaveBeenCalledWith(USER_ID, { force: true })
  })

  it('rejects invalid Discord IDs before making an HTTP request', async () => {
    expect(() => validateDiscordId('not-an-id')).toThrowError(
      'The supplied value is not a valid Discord user or bot ID'
    )
    await expectAsync(fetchTopggBotOwnership('123')).toBeRejectedWithError(
      'The supplied value is not a valid Discord user or bot ID'
    )
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('rejects GraphQL errors', async () => {
    global.fetch.and.resolveTo(
      graphqlResponse({ errors: [{ message: 'Query failed' }] })
    )

    await expectAsync(fetchTopggBotOwnership(BOT_ID)).toBeRejectedWithError(
      TopggLookupError,
      'Top.gg GraphQL error: Query failed'
    )
  })

  for (const status of [401, 403, 429, 500]) {
    it(`rejects an HTTP ${status} response`, async () => {
      global.fetch.and.resolveTo(
        graphqlResponse({ message: 'Upstream failure' }, status)
      )

      try {
        await fetchTopggBotOwnership(BOT_ID)
        fail('Expected the lookup to reject')
      } catch (error) {
        expect(error).toEqual(jasmine.any(TopggLookupError))
        expect(error.message).toContain(`HTTP ${status}`)
      }
    })
  }

  it('identifies a Cloudflare HTML challenge', async () => {
    global.fetch.and.resolveTo(
      new Response('<html><title>Just a moment...</title>cf-chl</html>', {
        status: 403,
        headers: { 'content-type': 'text/html' },
      })
    )

    await expectAsync(fetchTopggBotOwnership(BOT_ID)).toBeRejectedWithError(
      TopggLookupError,
      'Top.gg returned a Cloudflare challenge instead of GraphQL JSON'
    )
  })

  it('aborts a Top.gg request after the timeout', async () => {
    jasmine.clock().install()
    try {
      global.fetch.and.callFake(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              reject(new Error('aborted'))
            })
          })
      )

      const result = topggGraphql('query Test { __typename }', {})
      jasmine.clock().tick(10_001)

      await expectAsync(result).toBeRejectedWithError(
        TopggLookupError,
        'Top.gg GraphQL request timed out'
      )
    } finally {
      jasmine.clock().uninstall()
    }
  })

  it('caches successful lookups for repeated bot IDs', async () => {
    global.fetch.and.resolveTo(
      graphqlResponse({
        data: { bot: { owners: [], team: null } },
      })
    )

    await fetchTopggBotOwnership(BOT_ID)
    await fetchTopggBotOwnership(BOT_ID)

    expect(global.fetch).toHaveBeenCalledTimes(1)
  })
})
