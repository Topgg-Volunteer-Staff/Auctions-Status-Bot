/* eslint-disable @typescript-eslint/no-var-requires */
require('./jasmine/reporter')

const {
  getResolvedThreadName,
} = require('../dist/utils/tickets/resolvedThreadName')
const {
  hasTicketMovedNotice,
} = require('../dist/utils/tickets/legacyMigrationCleanup')

describe('resolved ticket thread names', () => {
  it('marks migrated source tickets as resolved', () => {
    expect(getResolvedThreadName('Reviewer - example')).toBe(
      '[Resolved] Reviewer - example'
    )
  })

  it('identifies the migration notice in recent message components', () => {
    expect(
      hasTicketMovedNotice({
        components: [
          {
            toJSON: () => ({
              components: [
                {
                  content: '## Ticket moved\nPlease continue in <#123456789>.',
                },
                { content: '**Moved by**\n<@123>\n\n**New queue**' },
              ],
            }),
          },
        ],
      })
    ).toBeTrue()
  })

  it('does not treat locking alone as proof that a ticket moved', () => {
    expect(
      hasTicketMovedNotice({
        content: 'This ticket was locked for another reason.',
        components: [],
      })
    ).toBeFalse()
  })
})
