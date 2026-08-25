/* eslint-disable @typescript-eslint/no-var-requires */
require('./jasmine/reporter')

const { ButtonStyle, ComponentType, MessageFlags } = require('discord.js')
const {
  buildKickVerificationCenterBotCustomId,
  buildUnresolvedVerificationCenterBotReminderContent,
  buildUnresolvedVerificationCenterBotReminderMessage,
  buildVerificationCenterBotReminderContent,
  buildVerificationCenterBotReminderMessage,
  getDueVerificationCenterBotReminder,
  hasVerificationCenterReminderExemptRole,
} = require('../dist/utils/verificationCenter/inactiveBotReminders')
const {
  execute: executeKickVerificationCenterBot,
  parseKickVerificationCenterBotCustomId,
} = require('../dist/buttons/kickVerificationCenterBot')
const {
  VERIFICATION_CENTER_GUILD_ID,
} = require('../dist/utils/verificationCenter/botMembers')
const { clearTopggTeamCache } = require('../dist/utils/topggTeams')

const DAY_MS = 24 * 60 * 60 * 1000

function noModPanelFetchResponse() {
  return new Response(JSON.stringify({ data: { entityExternal: null } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('inactive verification center bot reminders', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    clearTopggTeamCache()
    global.fetch = jasmine
      .createSpy('fetch')
      .and.resolveTo(noModPanelFetchResponse())
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('exempts VC bots with the configured role from reminders', () => {
    const exemptBot = {
      roles: {
        cache: new Map([['357194464776814603', {}]]),
      },
    }
    const regularBot = {
      roles: { cache: new Map([['357194464776814604', {}]]) },
    }

    expect(hasVerificationCenterReminderExemptRole(exemptBot)).toBeTrue()
    expect(hasVerificationCenterReminderExemptRole(regularBot)).toBeFalse()
  })

  it('does not send a reminder before 48 hours', () => {
    expect(
      getDueVerificationCenterBotReminder(2 * DAY_MS - 1, false, 0)
    ).toBeNull()
  })

  it('sends the one-time reminder at exactly 48 hours', () => {
    expect(getDueVerificationCenterBotReminder(2 * DAY_MS, false, 0)).toEqual({
      key: '48h',
      minimumAgeDays: 2,
      weeklyInterval: null,
    })
  })

  it('suppresses a duplicate 48-hour reminder', () => {
    expect(getDueVerificationCenterBotReminder(2 * DAY_MS, true, 0)).toBeNull()
  })

  it('does not repost a 48-hour reminder after an unresolved warning', () => {
    expect(
      getDueVerificationCenterBotReminder(2 * DAY_MS, false, 0, '48h')
    ).toBeNull()
  })

  it('prioritizes the first weekly reminder at exactly seven days', () => {
    expect(getDueVerificationCenterBotReminder(7 * DAY_MS, false, 0)).toEqual({
      key: '7d:1',
      minimumAgeDays: 7,
      weeklyInterval: 1,
    })
  })

  it('sends recurring reminders at fourteen and twenty-one days', () => {
    expect(getDueVerificationCenterBotReminder(14 * DAY_MS, true, 1)).toEqual({
      key: '7d:2',
      minimumAgeDays: 14,
      weeklyInterval: 2,
    })
    expect(getDueVerificationCenterBotReminder(21 * DAY_MS, true, 2)).toEqual({
      key: '7d:3',
      minimumAgeDays: 21,
      weeklyInterval: 3,
    })
  })

  it('does not repeat a reminder during the same weekly interval', () => {
    expect(getDueVerificationCenterBotReminder(13 * DAY_MS, true, 1)).toBeNull()
    expect(getDueVerificationCenterBotReminder(20 * DAY_MS, true, 2)).toBeNull()
  })

  it('does not repost a weekly reminder after an unresolved warning', () => {
    expect(
      getDueVerificationCenterBotReminder(7 * DAY_MS, false, 0, '7d:1')
    ).toBeNull()

    expect(
      getDueVerificationCenterBotReminder(14 * DAY_MS, false, 0, '7d:1')
    ).toEqual({
      key: '7d:2',
      minimumAgeDays: 14,
      weeklyInterval: 2,
    })
  })

  it('allows the next milestone after an unresolved warning', () => {
    expect(
      getDueVerificationCenterBotReminder(7 * DAY_MS, false, 0, '48h')
    ).toEqual({
      key: '7d:1',
      minimumAgeDays: 7,
      weeklyInterval: 1,
    })
  })

  it('does not backfill outside a reminder window and resumes weekly', () => {
    expect(
      getDueVerificationCenterBotReminder(100 * DAY_MS, true, 1)
    ).toBeNull()
    expect(getDueVerificationCenterBotReminder(105 * DAY_MS, true, 1)).toEqual({
      key: '7d:15',
      minimumAgeDays: 105,
      weeklyInterval: 15,
    })
  })

  it('expires reminder windows before the next milestone', () => {
    expect(getDueVerificationCenterBotReminder(3 * DAY_MS, false, 0)).toBeNull()
    expect(
      getDueVerificationCenterBotReminder(14 * DAY_MS - 1, true, 0)
    ).toBeNull()
  })

  it('builds a concise reviewer reminder with a live join timestamp', () => {
    const content = buildVerificationCenterBotReminderContent(
      '123456789012345678',
      {
        id: '223456789012345678',
        name: 'Example Bot',
        joinedTimestamp: 1_725_000_000_999,
        roleNames: ['Review Queue', 'Priority'],
      }
    )

    expect(content).toBe(
      '<@123456789012345678> -> Please check <@223456789012345678> (`Example Bot | 223456789012345678`) in the VC. It joined <t:1725000000:R>.\n\nCurrent Roles:\nReview Queue, Priority'
    )
  })

  it('sends the reviewer reminder as a compact Components V2 panel with pings enabled', async () => {
    const message = await buildVerificationCenterBotReminderMessage(
      '123456789012345678',
      {
        id: '223456789012345678',
        name: 'Example Bot',
        joinedTimestamp: 1_725_000_000_000,
        roleNames: ['Review Queue', 'Priority'],
      }
    )
    const panel = message.components[0].toJSON()

    expect(message.content).toBeUndefined()
    expect(message.flags).toBe(MessageFlags.IsComponentsV2)
    expect(message.allowedMentions).toEqual({
      users: ['123456789012345678', '223456789012345678'],
      roles: [],
      parse: [],
    })
    expect(panel).toEqual({
      type: ComponentType.Container,
      accent_color: 0xff3366,
      components: [
        {
          type: ComponentType.TextDisplay,
          content:
            '<@123456789012345678> -> Please check <@223456789012345678> (`Example Bot | 223456789012345678`) in the VC. It joined <t:1725000000:R>.\n\nCurrent Roles:\nReview Queue, Priority',
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              custom_id:
                'kickVerificationCenterBot_123456789012345678_223456789012345678_1725000000000',
              label: 'Kick Bot',
              style: ButtonStyle.Danger,
              disabled: false,
              emoji: undefined,
            },
          ],
        },
      ],
    })
  })

  it('adds an Open In Modpanel link button when the Top.gg internal ID resolves', async () => {
    global.fetch.and.resolveTo(
      new Response(
        JSON.stringify({
          data: { entityExternal: { internalId: '01HZXINTERNALID' } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )

    const message = await buildVerificationCenterBotReminderMessage(
      '123456789012345678',
      {
        id: '223456789012345678',
        name: 'Example Bot',
        joinedTimestamp: 1_725_000_000_000,
        roleNames: [],
      }
    )
    const buttons = message.components[0].toJSON().components[1].components

    expect(buttons).toHaveSize(2)
    expect(buttons[1]).toEqual(
      jasmine.objectContaining({
        label: 'Open In Modpanel',
        style: ButtonStyle.Link,
        url: 'https://moderation.top.gg/project/01HZXINTERNALID',
      })
    )
  })

  it('omits the Open In Modpanel button when the Top.gg lookup fails', async () => {
    global.fetch.and.rejectWith(new Error('network down'))

    const message = await buildVerificationCenterBotReminderMessage(
      '123456789012345678',
      {
        id: '223456789012345678',
        name: 'Example Bot',
        joinedTimestamp: 1_725_000_000_000,
        roleNames: [],
      }
    )
    const buttons = message.components[0].toJSON().components[1].components

    expect(buttons).toHaveSize(1)
    expect(buttons[0].label).toBe('Kick Bot')
  })

  it('keeps an unresolved reviewer alert short and only pings the bot', () => {
    const content = buildUnresolvedVerificationCenterBotReminderContent({
      id: '223456789012345678',
      name: 'Example Bot',
      reviewerName: 'Reviewer Nickname',
      joinedTimestamp: 1_725_000_000_000,
      roleNames: ['Review Queue', 'Priority'],
    })

    expect(content).toBe(
      'Please check <@223456789012345678> (`Example Bot | 223456789012345678`) in the VC. It joined <t:1725000000:R>. Could not match reviewer `Reviewer Nickname`.\n\nCurrent Roles:\nReview Queue, Priority'
    )
    expect(content.match(/<@!?(?:&)?\d+>/g)).toEqual(['<@223456789012345678>'])

    const message = buildUnresolvedVerificationCenterBotReminderMessage({
      id: '223456789012345678',
      name: 'Example Bot',
      reviewerName: 'Reviewer Nickname',
      joinedTimestamp: 1_725_000_000_000,
      roleNames: ['Review Queue', 'Priority'],
    })

    expect(message.flags).toBe(MessageFlags.IsComponentsV2)
    expect(message.allowedMentions).toEqual({
      users: ['223456789012345678'],
      roles: [],
      parse: [],
    })
    expect(message.components[0].toJSON().components).toHaveSize(1)
  })

  it('encodes the mentioned reviewer and original VC membership in the kick button', () => {
    expect(
      buildKickVerificationCenterBotCustomId('123456789012345678', {
        id: '223456789012345678',
        joinedTimestamp: 1_725_000_000_000,
      })
    ).toBe(
      'kickVerificationCenterBot_123456789012345678_223456789012345678_1725000000000'
    )

    expect(
      parseKickVerificationCenterBotCustomId(
        'kickVerificationCenterBot_123456789012345678_223456789012345678_1725000000000'
      )
    ).toEqual({
      reviewerId: '123456789012345678',
      botId: '223456789012345678',
      joinedTimestamp: 1_725_000_000_000,
    })
  })

  it('only lets the reviewer mentioned in the reminder kick the bot', async () => {
    const botMember = {
      user: { bot: true },
      joinedTimestamp: 1_725_000_000_000,
      kickable: true,
      guild: { id: 'verification-center-guild' },
      roles: {
        cache: new Map([
          ['role-id', { id: 'role-id', name: 'Review Queue', position: 1 }],
          [
            'verification-center-guild',
            {
              id: 'verification-center-guild',
              name: '@everyone',
              position: 0,
            },
          ],
        ]),
      },
      kick: jasmine.createSpy('kick').and.resolveTo(),
    }
    const fetchMember = jasmine
      .createSpy('fetchMember')
      .and.resolveTo(botMember)
    const fetchGuild = jasmine.createSpy('fetchGuild')
    const client = {
      guilds: {
        cache: new Map([
          [VERIFICATION_CENTER_GUILD_ID, { members: { fetch: fetchMember } }],
        ]),
        fetch: fetchGuild,
      },
    }
    const interaction = createKickInteraction({
      userId: '323456789012345678',
      customId:
        'kickVerificationCenterBot_123456789012345678_223456789012345678_1725000000000',
    })

    await executeKickVerificationCenterBot(client, interaction)

    expect(interaction.reply).toHaveBeenCalledWith({
      content:
        'Only the reviewer mentioned in this reminder can kick this bot.',
      flags: MessageFlags.Ephemeral,
    })
    expect(interaction.deferReply).not.toHaveBeenCalled()
    expect(fetchGuild).not.toHaveBeenCalled()
    expect(fetchMember).not.toHaveBeenCalled()
    expect(botMember.kick).not.toHaveBeenCalled()
  })

  it('kicks the original bot membership when the mentioned reviewer clicks', async () => {
    const botMember = {
      user: { bot: true },
      displayName: 'Reviewer | Example Bot',
      joinedTimestamp: 1_725_000_000_000,
      kickable: true,
      guild: { id: 'verification-center-guild' },
      roles: {
        cache: new Map([
          ['role-id', { id: 'role-id', name: 'Review Queue', position: 1 }],
          [
            'verification-center-guild',
            {
              id: 'verification-center-guild',
              name: '@everyone',
              position: 0,
            },
          ],
        ]),
      },
      kick: jasmine.createSpy('kick').and.resolveTo(),
    }
    const fetchMember = jasmine
      .createSpy('fetchMember')
      .and.resolveTo(botMember)
    const client = {
      guilds: {
        cache: new Map([
          [VERIFICATION_CENTER_GUILD_ID, { members: { fetch: fetchMember } }],
        ]),
        fetch: jasmine.createSpy('fetchGuild'),
      },
    }
    const interaction = createKickInteraction({
      userId: '123456789012345678',
      customId:
        'kickVerificationCenterBot_123456789012345678_223456789012345678_1725000000000',
    })

    await executeKickVerificationCenterBot(client, interaction)

    expect(interaction.reply).not.toHaveBeenCalled()
    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })
    expect(fetchMember).toHaveBeenCalledWith('223456789012345678')
    expect(botMember.kick).toHaveBeenCalledWith(
      'Kicked from Verification Center by Reviewer#0001 via inactive bot reminder'
    )
    const editedPanel = interaction.message.edit.calls
      .mostRecent()
      .args[0].components[0].toJSON()
    expect(editedPanel.components[1].components[0]).toEqual(
      jasmine.objectContaining({
        label: 'Kicked by Reviewer',
        disabled: true,
      })
    )
    expect(editedPanel.components[0].content).toContain(
      '(`Example Bot | 223456789012345678`)'
    )
    expect(editedPanel.components[0].content).toContain(
      'Current Roles:\nReview Queue'
    )
    expect(interaction.editReply).toHaveBeenCalledWith(
      'Kicked bot `223456789012345678` from the Verification Center.'
    )
  })

  it('does not kick a bot that has rejoined since the reminder was sent', async () => {
    const botMember = {
      user: { bot: true },
      joinedTimestamp: 1_725_000_000_001,
      kickable: true,
      kick: jasmine.createSpy('kick').and.resolveTo(),
    }
    const client = {
      guilds: {
        cache: new Map([
          [
            VERIFICATION_CENTER_GUILD_ID,
            {
              members: {
                fetch: jasmine
                  .createSpy('fetchMember')
                  .and.resolveTo(botMember),
              },
            },
          ],
        ]),
        fetch: jasmine.createSpy('fetchGuild'),
      },
    }
    const interaction = createKickInteraction({
      userId: '123456789012345678',
      customId:
        'kickVerificationCenterBot_123456789012345678_223456789012345678_1725000000000',
    })

    await executeKickVerificationCenterBot(client, interaction)

    expect(botMember.kick).not.toHaveBeenCalled()
    expect(interaction.editReply).toHaveBeenCalledWith(
      'This reminder is stale because the bot has rejoined the Verification Center.'
    )
  })
})

function createKickInteraction({ userId, customId }) {
  return {
    customId,
    user: { id: userId, username: 'Reviewer', tag: 'Reviewer#0001' },
    message: { edit: jasmine.createSpy('edit').and.resolveTo() },
    reply: jasmine.createSpy('reply').and.resolveTo(),
    deferReply: jasmine.createSpy('deferReply').and.resolveTo(),
    editReply: jasmine.createSpy('editReply').and.resolveTo(),
  }
}
