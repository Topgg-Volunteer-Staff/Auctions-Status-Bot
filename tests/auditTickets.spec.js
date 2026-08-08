/* eslint-disable @typescript-eslint/no-var-requires */
require('./jasmine/reporter')

const {
  buildAuditTicketsPaginationComponents,
  buildAuditTicketPageDescription,
  command,
  formatAuditTicketLoadingProgress,
  matchesAuditTicketCategory,
  paginateAuditTicketEntries,
} = require('../dist/commands/audit-tickets')

const createEntry = (category, index) => ({
  category,
  lastMessageAt: index * 1000,
  ownerId: index % 2 === 0 ? `staff-${index}` : null,
  threadId: `thread-${index}`,
})

describe('/audit-tickets pages', () => {
  it('shows useful progress while ticket details are checked', () => {
    const progress = formatAuditTicketLoadingProgress(10, 25)

    expect(progress).toContain('Checking **25** candidate tickets')
    expect(progress).toContain('`[####------]` **10/25** (40%)')
    expect(progress).toContain('staff handlers and latest message times')
  })

  it('registers optional category and staff filters', () => {
    const options = command.toJSON().options

    expect(options.map((option) => option.name)).toEqual(['category', 'staff'])
    expect(options[0].choices.map((choice) => choice.value)).toEqual([
      'all',
      'mod',
      'auctions',
      'reviewer',
    ])
  })

  it('matches ticket categories and preserves filters in page buttons', () => {
    expect(matchesAuditTicketCategory('Mod', 'mod')).toBeTrue()
    expect(matchesAuditTicketCategory('Reviewer', 'mod')).toBeFalse()
    expect(matchesAuditTicketCategory('Auctions', 'all')).toBeTrue()

    const rows = buildAuditTicketsPaginationComponents('requester', 0, 2, {
      category: 'reviewer',
      staffUserId: '12345',
    })
    const previousButton = rows[0].toJSON().components[0]

    expect(previousButton.custom_id).toBe(
      'auditTicketsPage_requester_reviewer_12345_0'
    )
  })

  it('adds pages when more than eight tickets are open', () => {
    const entries = Array.from({ length: 9 }, (_, index) =>
      createEntry('Mod', index)
    )

    const pages = paginateAuditTicketEntries(entries)

    expect(pages.length).toBe(2)
    expect(pages[0].length).toBe(8)
    expect(pages[1].length).toBe(1)
  })

  it('renders categorized sections, handlers, timestamps, and links', () => {
    const description = buildAuditTicketPageDescription(
      [
        createEntry('Mod', 2),
        createEntry('Auctions', 3),
        createEntry('Reviewer', 4),
      ],
      'guild-id'
    )

    expect(description.indexOf('**Mod Tickets**')).toBeLessThan(
      description.indexOf('**Auction Tickets**')
    )
    expect(description.indexOf('**Auction Tickets**')).toBeLessThan(
      description.indexOf('**Reviewer Tickets**')
    )
    expect(description).toContain('Staff: <@staff-2>')
    expect(description).toContain('Staff: **Unclaimed**')
    expect(description).toContain('Last message: <t:2:f> (<t:2:R>)')
    expect(description).toContain(
      '[Open](https://discord.com/channels/guild-id/thread-2)'
    )
  })
})
