/* eslint-disable @typescript-eslint/no-var-requires */
require('./jasmine/reporter')

const {
  signPayload,
  verifyPayload,
  readSession,
  createSessionCookie,
  createOAuthState,
  consumeOAuthState,
  sanitizeNextPath,
  extractParticipantIdsFromHtml,
  isTranscriptParticipant,
  injectBypassBanner,
} = require('../dist/utils/transcriptAuth')

const SECRET = 'a'.repeat(32)

const cookieHeaderFrom = (setCookie) => setCookie.split(';')[0]

describe('transcript auth', () => {
  describe('signed payloads', () => {
    it('round-trips a payload', () => {
      const token = signPayload(SECRET, { userId: '1' }, 60_000)
      expect(verifyPayload(SECRET, token).userId).toBe('1')
    })

    it('rejects a tampered payload', () => {
      const token = signPayload(SECRET, { userId: '1' }, 60_000)
      const [, signature] = token.split('.')
      const forged = `${Buffer.from(
        JSON.stringify({ userId: '2', exp: Date.now() + 60_000 })
      ).toString('base64url')}.${signature}`
      expect(verifyPayload(SECRET, forged)).toBeNull()
    })

    it('rejects a payload signed with another secret', () => {
      const token = signPayload('b'.repeat(32), { userId: '1' }, 60_000)
      expect(verifyPayload(SECRET, token)).toBeNull()
    })

    it('rejects an expired payload', () => {
      const token = signPayload(SECRET, { userId: '1' }, 1_000, 0)
      expect(verifyPayload(SECRET, token, 2_000)).toBeNull()
    })
  })

  it('reads a session from its cookie', () => {
    const cookie = createSessionCookie(SECRET, {
      userId: '123456789012345678',
      username: 'someone',
    })
    expect(readSession(SECRET, cookieHeaderFrom(cookie))).toEqual({
      userId: '123456789012345678',
      username: 'someone',
    })
    expect(readSession(SECRET, undefined)).toBeNull()
  })

  describe('oauth state', () => {
    it('returns the next path when state matches', () => {
      const next = '/transcript/0b7c7e3e-6a0b-4b7e-9a35-3f7c2e1d9f00'
      const { state, cookie } = createOAuthState(SECRET, next)
      expect(consumeOAuthState(SECRET, cookieHeaderFrom(cookie), state)).toBe(
        next
      )
    })

    it('rejects a mismatched state', () => {
      const { cookie } = createOAuthState(SECRET, '/transcript/abc')
      expect(
        consumeOAuthState(SECRET, cookieHeaderFrom(cookie), 'other')
      ).toBeNull()
    })
  })

  it('only allows redirects back to transcript pages', () => {
    expect(sanitizeNextPath('/transcript/abc-123')).toBe('/transcript/abc-123')
    expect(sanitizeNextPath('https://evil.example')).toBeNull()
    expect(sanitizeNextPath('//evil.example/transcript/abc')).toBeNull()
    expect(sanitizeNextPath('/transcript/../auth/logout')).toBeNull()
    expect(sanitizeNextPath(['/transcript/abc'])).toBeNull()
  })

  describe('participants', () => {
    const html =
      '<img data-user="111111111111111111"><span data-user="222222222222222222"></span><img data-user="111111111111111111">'

    it('extracts message authors from legacy transcript HTML', () => {
      expect(extractParticipantIdsFromHtml(html)).toEqual([
        '111111111111111111',
        '222222222222222222',
      ])
    })

    it('prefers stored participant IDs over HTML', () => {
      const transcript = {
        userId: '999999999999999999',
        participantIds: ['333333333333333333'],
        transcriptHtml: html,
      }
      expect(isTranscriptParticipant('333333333333333333', transcript)).toBe(
        true
      )
      expect(isTranscriptParticipant('111111111111111111', transcript)).toBe(
        false
      )
      expect(isTranscriptParticipant('999999999999999999', transcript)).toBe(
        true
      )
    })

    it('falls back to HTML for legacy transcripts', () => {
      const transcript = { userId: '999999999999999999', transcriptHtml: html }
      expect(isTranscriptParticipant('222222222222222222', transcript)).toBe(
        true
      )
      expect(isTranscriptParticipant('444444444444444444', transcript)).toBe(
        false
      )
    })
  })

  it('injects an escaped bypass banner right after <body>', () => {
    const result = injectBypassBanner(
      '<html><body class="x"><div>hi</div></body></html>',
      '<Moderator>'
    )
    expect(result).toContain(
      '<body class="x"><div id="transcript-access-banner"'
    )
    expect(result).toContain('Bypassing for &lt;Moderator&gt;')
    expect(result).not.toContain('<Moderator>')
  })
})
