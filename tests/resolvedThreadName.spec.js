/* eslint-disable @typescript-eslint/no-var-requires */
require('./jasmine/reporter')

const {
  getResolvedThreadName,
} = require('../dist/utils/tickets/resolvedThreadName')
const {
  hasTicketMovedNotice,
  setResolvedNamePreservingArchiveState,
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

  it('temporarily unarchives a migrated ticket before renaming it', async () => {
    const operations = []
    const thread = {
      archived: true,
      name: 'williamdevgg',
      setArchived: async (archived) => {
        operations.push(`archived:${archived}`)
        thread.archived = archived
      },
      setName: async (name) => {
        operations.push(`name:${name}`)
        thread.name = name
      },
    }

    await setResolvedNamePreservingArchiveState(thread)

    expect(operations).toEqual([
      'archived:false',
      'name:[Resolved] williamdevgg',
      'archived:true',
    ])
    expect(thread.archived).toBeTrue()
  })
})
