/* eslint-disable @typescript-eslint/no-var-requires */
require('./jasmine/reporter')

const { ComponentType, MessageFlags } = require('discord.js')
const {
  buildUnresolvedVerificationCenterBotReminderContent,
  buildUnresolvedVerificationCenterBotReminderMessage,
  buildVerificationCenterBotReminderContent,
  buildVerificationCenterBotReminderMessage,
  getDueVerificationCenterBotReminder,
} = require('../dist/utils/verificationCenter/inactiveBotReminders')

const DAY_MS = 24 * 60 * 60 * 1000

describe('inactive verification center bot reminders', () => {
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
        joinedTimestamp: 1_725_000_000_999,
      }
    )

    expect(content).toBe(
      '<@123456789012345678> -> Please check <@223456789012345678> (`223456789012345678`) in the VC. It joined <t:1725000000:R>.'
    )
  })

  it('sends the reviewer reminder as a compact Components V2 panel with pings enabled', () => {
    const message = buildVerificationCenterBotReminderMessage(
      '123456789012345678',
      {
        id: '223456789012345678',
        joinedTimestamp: 1_725_000_000_000,
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
            '<@123456789012345678> -> Please check <@223456789012345678> (`223456789012345678`) in the VC. It joined <t:1725000000:R>.',
        },
      ],
    })
  })

  it('keeps an unresolved reviewer alert short and only pings the bot', () => {
    const content = buildUnresolvedVerificationCenterBotReminderContent({
      id: '223456789012345678',
      reviewerName: 'Reviewer Nickname',
      joinedTimestamp: 1_725_000_000_000,
    })

    expect(content).toBe(
      'Please check <@223456789012345678> (`223456789012345678`) in the VC. It joined <t:1725000000:R>. Could not match reviewer `Reviewer Nickname`.'
    )
    expect(content.match(/<@!?(?:&)?\d+>/g)).toEqual(['<@223456789012345678>'])

    const message = buildUnresolvedVerificationCenterBotReminderMessage({
      id: '223456789012345678',
      reviewerName: 'Reviewer Nickname',
      joinedTimestamp: 1_725_000_000_000,
    })

    expect(message.flags).toBe(MessageFlags.IsComponentsV2)
    expect(message.allowedMentions).toEqual({
      users: ['223456789012345678'],
      roles: [],
      parse: [],
    })
  })
})
