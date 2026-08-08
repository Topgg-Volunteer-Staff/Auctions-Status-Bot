/* eslint-disable @typescript-eslint/no-var-requires */
require('./jasmine/reporter')

const {
  getDue7DayAlertInterval,
  is14DayStaffResponseAlertDue,
} = require('../dist/utils/tickets/checkInactiveThreads')

const DAY_MS = 24 * 60 * 60 * 1000

describe('recurring inactive ticket reminders', () => {
  it('does not send the recurring reminder before seven days', () => {
    expect(getDue7DayAlertInterval(6 * DAY_MS, 0)).toBeNull()
  })

  it('sends reminders at successive seven-day intervals', () => {
    expect(getDue7DayAlertInterval(7 * DAY_MS, 0)).toBe(1)
    expect(getDue7DayAlertInterval(14 * DAY_MS, 1)).toBe(2)
    expect(getDue7DayAlertInterval(21 * DAY_MS, 2)).toBe(3)
  })

  it('does not repeat a reminder during the same interval', () => {
    expect(getDue7DayAlertInterval(13 * DAY_MS, 1)).toBeNull()
    expect(getDue7DayAlertInterval(20 * DAY_MS, 2)).toBeNull()
  })

  it('advances directly to the current interval after downtime', () => {
    expect(getDue7DayAlertInterval(22 * DAY_MS, 1)).toBe(3)
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
})
