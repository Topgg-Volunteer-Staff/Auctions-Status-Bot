/* eslint-disable @typescript-eslint/no-var-requires */
require('./jasmine/reporter')

const {
  buildUnresolvedVerificationCenterBotReminderContent,
  buildVerificationCenterBotReminderContent,
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

  it('builds a 48-hour reviewer reminder with bot and join details', () => {
    const content = buildVerificationCenterBotReminderContent(
      '123456789012345678',
      {
        id: '223456789012345678',
        name: 'Example Bot',
        joinedTimestamp: 1_725_000_000_999,
      },
      { key: '48h', minimumAgeDays: 2, weeklyInterval: null }
    )

    expect(content).toContain('<@123456789012345678>')
    expect(content).toContain('`Example Bot`')
    expect(content).toContain('`223456789012345678`')
    expect(content).toContain('48 hours')
    expect(content).toContain('<t:1725000000:R>')
  })

  it('uses the weekly duration in recurring reviewer reminders', () => {
    const content = buildVerificationCenterBotReminderContent(
      '123456789012345678',
      {
        id: '223456789012345678',
        name: 'Example Bot',
        joinedTimestamp: 1_725_000_000_000,
      },
      { key: '7d:3', minimumAgeDays: 21, weeklyInterval: 3 }
    )

    expect(content).toContain('21 days')
    expect(content).not.toContain('48 hours')
  })

  it('identifies an unresolved reviewer by nickname without mentioning them', () => {
    const content = buildUnresolvedVerificationCenterBotReminderContent(
      {
        id: '223456789012345678',
        name: 'Example Bot',
        reviewerName: 'Reviewer Nickname',
        joinedTimestamp: 1_725_000_000_000,
      },
      { key: '7d:2', minimumAgeDays: 14, weeklyInterval: 2 }
    )

    expect(content).toContain('`Reviewer Nickname`')
    expect(content).toContain('`Example Bot`')
    expect(content).toContain('`223456789012345678`')
    expect(content).toContain('14 days')
    expect(content).not.toMatch(/<@!?(?:&)?\d+>/)
  })
})
