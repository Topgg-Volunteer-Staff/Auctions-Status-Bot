/* eslint-disable @typescript-eslint/no-var-requires */
require('./jasmine/reporter')

const { Collection } = require('discord.js')
const { roleIds } = require('../dist/globals')
const {
  getDue7DayAlertInterval,
  is48HourAlertDue,
  is14DayStaffResponseAlertDue,
  shouldSend14DayStaffResponseAlertForCategory,
  buildMissingStaffResponseAlertContent,
  getAssignedReviewerMentionedUserId,
  getMostActiveRoutedStaffSpeaker,
  getTicketMetadataMentionedUserIds,
  sendInactiveAlert,
} = require('../dist/utils/tickets/checkInactiveThreads')
const {
  isTrackedTicketActivity,
  shouldEnrollWeeklyReminderCycle,
} = require('../dist/utils/tickets/trackActivity')

const DAY_MS = 24 * 60 * 60 * 1000

describe('recurring inactive ticket reminders', () => {
  it('only sends the two-day reminder during the following 24 hours', () => {
    expect(is48HourAlertDue(2 * DAY_MS, false)).toBeTrue()
    expect(is48HourAlertDue(3 * DAY_MS - 1, false)).toBeTrue()
    expect(is48HourAlertDue(3 * DAY_MS, false)).toBeFalse()
    expect(is48HourAlertDue(119 * DAY_MS, false)).toBeFalse()
  })

  it('does not send the recurring reminder before seven days', () => {
    expect(getDue7DayAlertInterval(6 * DAY_MS, 0, true)).toBeNull()
  })

  it('sends reminders at successive seven-day intervals', () => {
    expect(getDue7DayAlertInterval(7 * DAY_MS, 0, true)).toBe(1)
    expect(getDue7DayAlertInterval(14 * DAY_MS, 1, true)).toBe(2)
    expect(getDue7DayAlertInterval(21 * DAY_MS, 2, true)).toBe(3)
  })

  it('resumes at a fresh weekly threshold after missing an earlier window', () => {
    expect(getDue7DayAlertInterval(22 * DAY_MS, 1, true)).toBeNull()
    expect(getDue7DayAlertInterval(28 * DAY_MS, 1, true)).toBe(4)
  })

  it('only sends each weekly reminder during its 24-hour window', () => {
    expect(getDue7DayAlertInterval(8 * DAY_MS - 1, 0, true)).toBe(1)
    expect(getDue7DayAlertInterval(8 * DAY_MS, 0, true)).toBeNull()
    expect(getDue7DayAlertInterval(15 * DAY_MS - 1, 1, true)).toBe(2)
    expect(getDue7DayAlertInterval(15 * DAY_MS, 1, true)).toBeNull()
  })

  it('does not repeat a reminder during the same interval', () => {
    expect(getDue7DayAlertInterval(13 * DAY_MS, 1, true)).toBeNull()
    expect(getDue7DayAlertInterval(20 * DAY_MS, 2, true)).toBeNull()
  })

  it('does not catch up an old ticket with no matching reminder history', () => {
    expect(getDue7DayAlertInterval(119 * DAY_MS, 0, false)).toBeNull()
    expect(getDue7DayAlertInterval(119 * DAY_MS, 1, false)).toBeNull()
  })

  it('rejects old tickets even when stored history looks sequential', () => {
    expect(getDue7DayAlertInterval(77 * DAY_MS, 10, false)).toBeNull()
    expect(getDue7DayAlertInterval(105 * DAY_MS, 14, false)).toBeNull()
  })

  it('only enrolls newly discovered cycles through the first weekly window', () => {
    expect(shouldEnrollWeeklyReminderCycle(7 * DAY_MS)).toBeTrue()
    expect(shouldEnrollWeeklyReminderCycle(8 * DAY_MS - 1)).toBeTrue()
    expect(shouldEnrollWeeklyReminderCycle(8 * DAY_MS)).toBeFalse()
    expect(shouldEnrollWeeklyReminderCycle(77 * DAY_MS)).toBeFalse()
    expect(shouldEnrollWeeklyReminderCycle(105 * DAY_MS)).toBeFalse()
  })

  it('uses only human messages as inactivity activity', () => {
    expect(
      isTrackedTicketActivity({
        author: { bot: false },
        webhookId: null,
        system: false,
      })
    ).toBeTrue()
    expect(
      isTrackedTicketActivity({
        author: { bot: true },
        webhookId: null,
        system: false,
      })
    ).toBeFalse()
    expect(
      isTrackedTicketActivity({
        author: { bot: false },
        webhookId: '123',
        system: false,
      })
    ).toBeFalse()
    expect(
      isTrackedTicketActivity({
        author: { bot: false },
        webhookId: null,
        system: true,
      })
    ).toBeFalse()
  })

  it('does not report a failed Discord send as successful', async () => {
    spyOn(console, 'error')
    const alertChannel = {
      send: async () => Promise.reject(new Error('Discord unavailable')),
    }
    const thread = { id: '123' }

    expect(
      await sendInactiveAlert(alertChannel, thread, '7d', '456')
    ).toBeFalse()
  })

  it('finds ticket participants mentioned in Components V2 and embeds', () => {
    const openerId = '1526773378055147680'
    const reviewerId = '1526773378055147681'
    const mentorId = '1526773378055147682'
    const message = {
      content: '',
      components: [
        {
          data: {
            components: [
              {
                data: {
                  content: `<@${openerId}> has opened a dispute. <@${reviewerId}> please take a look. (Mentor: <@${mentorId}>)`,
                },
              },
            ],
          },
        },
      ],
      embeds: [
        {
          fields: [
            {
              name: 'Reviewer',
              value: `<@${reviewerId}> (top.gg profile)`,
            },
          ],
        },
      ],
    }

    expect(getAssignedReviewerMentionedUserId(message)).toBe(reviewerId)
    expect(getAssignedReviewerMentionedUserId({ embeds: message.embeds })).toBe(
      reviewerId
    )
    expect(getTicketMetadataMentionedUserIds(message)).toEqual([
      openerId,
      reviewerId,
      mentorId,
    ])
    expect(
      getTicketMetadataMentionedUserIds({
        components: [{ content: `Unrelated evidence: <@${mentorId}>` }],
      })
    ).toEqual([])
    expect(
      getAssignedReviewerMentionedUserId({
        components: [
          { content: `Quoted request: <@${mentorId}> please take a look` },
        ],
      })
    ).toBeNull()
    expect(
      getTicketMetadataMentionedUserIds({
        embeds: [
          {
            fields: [
              { name: 'Reviewer', value: `<@${reviewerId}>` },
              { name: 'Reason', value: `Reported by <@${mentorId}>` },
            ],
          },
        ],
      })
    ).toEqual([reviewerId])
  })

  it('pings the assigned reviewer from a dispute component instead of giving up', async () => {
    const botId = '1526773378055147679'
    const openerId = '1526773378055147680'
    const reviewerId = '1526773378055147681'
    const mentorId = '1526773378055147682'
    const members = new Map([
      [openerId, createMember(openerId, [])],
      [reviewerId, createMember(reviewerId, [roleIds.reviewer])],
      [mentorId, createMember(mentorId, ['304313580025544704'])],
    ])
    const messages = new Collection([
      [
        'newer-message-id',
        {
          author: { bot: true, id: botId },
          components: [],
          content: `<@${mentorId}> is also helping with this ticket.`,
          createdTimestamp: 2,
          embeds: [],
        },
      ],
      [
        'message-id',
        {
          author: { bot: true, id: botId },
          components: [
            {
              components: [
                {
                  content: `<@${openerId}> has opened a dispute. <@${reviewerId}> please take a look. (Mentor: <@${mentorId}>)`,
                },
              ],
            },
          ],
          content: '',
          createdTimestamp: 1,
          embeds: [],
        },
      ],
    ])
    const thread = {
      client: { user: { id: botId } },
      guild: {
        members: {
          fetch: async (memberId) => members.get(memberId) ?? null,
        },
      },
      messages: { fetch: async () => messages },
    }
    const selectedStaff = await getMostActiveRoutedStaffSpeaker(thread)
    const alertChannel = { send: jasmine.createSpy('send').and.resolveTo() }

    expect(selectedStaff).toEqual({
      memberId: reviewerId,
      route: 'reviewers',
      isTrialReviewer: false,
    })
    expect(
      await sendInactiveAlert(
        alertChannel,
        { id: 'thread-id' },
        '2d',
        selectedStaff.memberId
      )
    ).toBeTrue()
    expect(alertChannel.send).toHaveBeenCalledWith(
      `<@${reviewerId}>  -> :warning: Please check <#thread-id> - inactive since 2d`
    )
  })
})

function createMember(id, assignedRoleIds) {
  const roles = new Set(assignedRoleIds)
  return { id, roles: { cache: { has: (roleId) => roles.has(roleId) } } }
}

describe('missing staff response alerts', () => {
  it('only includes reviewer tickets', () => {
    expect(shouldSend14DayStaffResponseAlertForCategory('Reviewer')).toBeTrue()
    expect(shouldSend14DayStaffResponseAlertForCategory('Mod')).toBeFalse()
    expect(shouldSend14DayStaffResponseAlertForCategory('Auctions')).toBeFalse()
  })

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
