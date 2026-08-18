/* eslint-disable @typescript-eslint/no-var-requires */
require('./jasmine/reporter')

const {
  VERIFICATION_CENTER_GUILD_ID,
  findExactMemberByName,
  findMemberByName,
  getBotsForStaffMember,
  getVerificationCenterBot,
  parseVerificationCenterBotName,
} = require('../dist/utils/verificationCenter/botMembers')

const VC_GUILD_ID = '333949691962195969'

describe('verification center bot members', () => {
  it('parses and trims the reviewer and bot names', () => {
    expect(
      parseVerificationCenterBotName('   Reviewer Name   |   Example Bot   ')
    ).toEqual({
      reviewerName: 'Reviewer Name',
      name: 'Example Bot',
    })
    expect(VERIFICATION_CENTER_GUILD_ID).toBe(VC_GUILD_ID)
  })

  it('rejects malformed bot names', () => {
    for (const value of [
      '',
      'Reviewer without a bot',
      ' | Example Bot',
      'Reviewer | ',
    ]) {
      expect(parseVerificationCenterBotName(value))
        .withContext(value)
        .toBeNull()
    }

    expect(
      parseVerificationCenterBotName('Reviewer | Example Bot | Secondary')
    ).toEqual({
      reviewerName: 'Reviewer',
      name: 'Example Bot | Secondary',
    })
  })

  it('only converts bots with a valid formatted name and join time', () => {
    const validBot = createMember({
      id: 'bot-id',
      bot: true,
      displayName: 'Reviewer | Example Bot',
      joinedTimestamp: 1234,
    })

    expect(getVerificationCenterBot(validBot)).toEqual({
      id: 'bot-id',
      reviewerName: 'Reviewer',
      name: 'Example Bot',
      joinedTimestamp: 1234,
    })
    expect(
      getVerificationCenterBot(
        createMember({ bot: false, displayName: 'Reviewer | Human' })
      )
    ).toBeNull()
    expect(
      getVerificationCenterBot(
        createMember({ bot: true, displayName: 'Malformed bot name' })
      )
    ).toBeNull()
    expect(
      getVerificationCenterBot(
        createMember({
          bot: true,
          displayName: 'Reviewer | Example Bot',
          joinedTimestamp: null,
        })
      )
    ).toBeNull()
  })

  it('uses an exact match even when a fuzzy candidate appears first', () => {
    const fuzzy = createMember({ id: 'fuzzy', username: 'Reviewr' })
    const exact = createMember({ id: 'exact', username: 'Reviewer' })

    expect(findMemberByName('Reviewer', [fuzzy, exact])).toBe(exact)
  })

  it('matches a reviewer by username, global name, or nickname', () => {
    const usernameMember = createMember({
      id: 'username',
      username: 'Username Match',
    })
    const globalNameMember = createMember({
      id: 'global-name',
      username: 'unrelated-one',
      globalName: 'Global Match',
    })
    const nicknameMember = createMember({
      id: 'nickname',
      username: 'unrelated-two',
      nickname: 'Nickname Match',
    })
    const members = new Set([usernameMember, globalNameMember, nicknameMember])

    expect(findMemberByName('Username Match', members)).toBe(usernameMember)
    expect(findMemberByName('Global Match', members)).toBe(globalNameMember)
    expect(findMemberByName('Nickname Match', members)).toBe(nicknameMember)
  })

  it('uses a unique fuzzy reviewer match', () => {
    const reviewer = createMember({ id: 'reviewer', username: 'Reviewer' })

    expect(findMemberByName('Reviewr', [reviewer])).toBe(reviewer)
  })

  it('matches a unique shortened reviewer name to a longer username', () => {
    const reviewer = createMember({
      id: 'marco',
      username: 'marco_rennmaus',
    })

    expect(findMemberByName('marco', [reviewer])).toBe(reviewer)
  })

  it('does not guess between shortened reviewer name matches', () => {
    const first = createMember({ id: 'first', username: 'marco_rennmaus' })
    const second = createMember({ id: 'second', username: 'marco_other' })

    expect(findMemberByName('marco', [first, second])).toBeNull()
  })

  it('supports exact-only member lookups', () => {
    const exact = createMember({ id: 'exact', nickname: 'Reviewer Name' })
    const fuzzy = createMember({ id: 'fuzzy', nickname: 'Reviewer Names' })

    expect(findExactMemberByName('Reviewer Name', [fuzzy, exact])).toBe(exact)
    expect(findExactMemberByName('Reviewer Nam', [exact])).toBeNull()
  })

  it('does not choose between ambiguous exact reviewer matches', () => {
    const first = createMember({
      id: 'first',
      username: 'unrelated-one',
      nickname: 'Shared Name',
    })
    const second = createMember({
      id: 'second',
      username: 'unrelated-two',
      globalName: 'Shared Name',
    })

    expect(findMemberByName('Shared Name', [first, second])).toBeNull()
  })

  it('does not choose between ambiguous fuzzy reviewer matches', () => {
    const first = createMember({ id: 'first', username: 'Alixe' })
    const second = createMember({ id: 'second', username: 'Alica' })

    expect(findMemberByName('Alice', [first, second])).toBeNull()
  })

  it('keeps break notifications matched to reviewer-formatted VC bots', async () => {
    const verificationCenterMembers = new Map([
      [
        'exact-bot',
        createMember({
          id: 'exact-bot',
          bot: true,
          displayName: 'Reviewer | Exact Bot',
          joinedTimestamp: 100,
        }),
      ],
      [
        'fuzzy-bot',
        createMember({
          id: 'fuzzy-bot',
          bot: true,
          displayName: 'Reviewr | Fuzzy Bot',
          joinedTimestamp: 200,
        }),
      ],
      [
        'other-bot',
        createMember({
          id: 'other-bot',
          bot: true,
          displayName: 'Someone Else | Other Bot',
          joinedTimestamp: 300,
        }),
      ],
    ])
    const verificationCenter = {
      members: { fetch: async () => verificationCenterMembers },
    }
    const staffMember = createMember({
      id: 'staff',
      username: 'Reviewer',
      client: {
        guilds: {
          cache: new Map([[VC_GUILD_ID, verificationCenter]]),
          fetch: jasmine.createSpy('guilds.fetch'),
        },
      },
    })

    expect(await getBotsForStaffMember(staffMember)).toEqual([
      {
        id: 'exact-bot',
        reviewerName: 'Reviewer',
        name: 'Exact Bot',
        joinedTimestamp: 100,
      },
      {
        id: 'fuzzy-bot',
        reviewerName: 'Reviewr',
        name: 'Fuzzy Bot',
        joinedTimestamp: 200,
      },
    ])
    expect(staffMember.client.guilds.fetch).not.toHaveBeenCalled()
  })
})

function createMember({
  id = 'member-id',
  bot = false,
  username = 'member',
  globalName = null,
  nickname = null,
  displayName = nickname ?? username,
  joinedTimestamp = 1,
  client = {},
} = {}) {
  return {
    id,
    client,
    displayName,
    joinedTimestamp,
    nickname,
    user: { bot, globalName, username },
  }
}
