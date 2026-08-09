/* eslint-disable @typescript-eslint/no-var-requires */
require('./jasmine/reporter')

const {
  getDue7DayAlertInterval,
  is48HourAlertDue,
  is14DayStaffResponseAlertDue,
  buildMissingStaffResponseAlertContent,
} = require('../dist/utils/tickets/checkInactiveThreads')

const DAY_MS = 24 * 60 * 60 * 1000

describe('recurring inactive ticket reminders', () => {
  it('only sends the two-day reminder during the following 24 hours', () => {
    expect(is48HourAlertDue(2 * DAY_MS, false)).toBeTrue()
    expect(is48HourAlertDue(3 * DAY_MS - 1, false)).toBeTrue()
    expect(is48HourAlertDue(3 * DAY_MS, false)).toBeFalse()
    expect(is48HourAlertDue(119 * DAY_MS, false)).toBeFalse()
  })

  it('does not send the recurring reminder before seven days', () => {
    expect(getDue7DayAlertInterval(6 * DAY_MS, 0)).toBeNull()
  })

  it('sends reminders at successive seven-day intervals', () => {
    expect(getDue7DayAlertInterval(7 * DAY_MS, 0)).toBe(1)
    expect(getDue7DayAlertInterval(14 * DAY_MS, 1)).toBe(2)
    expect(getDue7DayAlertInterval(21 * DAY_MS, 2)).toBe(3)
  })

  it('only sends each weekly reminder during its 24-hour window', () => {
    expect(getDue7DayAlertInterval(8 * DAY_MS - 1, 0)).toBe(1)
    expect(getDue7DayAlertInterval(8 * DAY_MS, 0)).toBeNull()
    expect(getDue7DayAlertInterval(15 * DAY_MS - 1, 1)).toBe(2)
    expect(getDue7DayAlertInterval(15 * DAY_MS, 1)).toBeNull()
  })

  it('does not repeat a reminder during the same interval', () => {
    expect(getDue7DayAlertInterval(13 * DAY_MS, 1)).toBeNull()
    expect(getDue7DayAlertInterval(20 * DAY_MS, 2)).toBeNull()
  })

  it('does not catch up an old ticket with no matching reminder history', () => {
    expect(getDue7DayAlertInterval(119 * DAY_MS, 0)).toBeNull()
    expect(getDue7DayAlertInterval(119 * DAY_MS, 1)).toBeNull()
  })
})

describe('missing staff response alerts', () => {
  it('waits until the last staff activity is fourteen days old', () => {
    const now = 20 * DAY_MS

    expect(is14DayStaffResponseAlertDue(now, 7 * DAY_MS, false)).toBeFalse()
    expect(is14DayStaffResponseAlertDue(now, 6 * DAY_MS, false)).toBeTrue()
  })

  it('does not repeat for the same staff response cycle', () => {
    expect(
      is14DayStaffResponseAlertDue(20 * DAY_MS, 6 * DAY_MS, true)
    ).toBeFalse()
  })

  it('does not backfill alerts for years-old staff activity', () => {
    const fourYears = 4 * 365 * DAY_MS

    expect(is14DayStaffResponseAlertDue(fourYears, 0, false)).toBeFalse()
  })

  it('combines a backlog without mentioning the moderator role', () => {
    const alerts = Array.from({ length: 256 }, (_, index) => ({
      threadId: String(1000 + index),
      staffActivityBaseline: DAY_MS,
      lastStaffMessageTime: DAY_MS,
      threadCreatedTimestamp: 0,
    }))

    const content = buildMissingStaffResponseAlertContent(alerts)

    expect(content).not.toMatch(/<@&\d+>/)
    expect(content.match(/^- <#/gm)?.length).toBe(15)
    expect(content).toContain('256 open tickets')
    expect(content).toContain('and 241 more')
    expect(content.length).toBeLessThanOrEqual(2000)
  })
})
