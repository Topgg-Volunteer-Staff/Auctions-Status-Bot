import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { Client, Guild } from 'discord.js'

import { channelIds, roleIds } from '../globals'

export const SESSION_COOKIE = 'transcript_session'
export const OAUTH_STATE_COOKIE = 'transcript_oauth_state'

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
// Role checks hit the Discord API; a page with many images makes one request
// per asset, so remember each user's roles briefly.
const ROLE_CACHE_TTL_MS = 60 * 1000

const DISCORD_API = 'https://discord.com/api/v10'

// Staff who may open any transcript, in the order their name is shown on the
// bypass banner when someone holds several.
const BYPASS_ROLES: Array<{ id: string; name: string }> = [
  { id: roleIds.moderator, name: 'Moderator' },
  { id: roleIds.reviewer, name: 'Reviewer' },
  { id: roleIds.communityTeam, name: 'Community Team' },
]

export interface TranscriptSession {
  userId: string
  username: string
}

export type TranscriptAccess =
  | { allowed: true; bypassRole: string | null }
  | { allowed: false }

type OAuthState = { state: string; next: string }

type SignedPayload<T> = T & { exp: number }

export interface TranscriptAuthConfig {
  clientId: string
  clientSecret: string
  sessionSecret: string
  redirectUri: string
}

/**
 * Reads OAuth/session settings from the environment. Throws if anything is
 * missing so the web server refuses to start rather than serving transcripts
 * without a working access check.
 */
export const loadTranscriptAuthConfig = (
  transcriptDomain: string
): TranscriptAuthConfig => {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim() ?? ''
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim() ?? ''
  const sessionSecret = process.env.TRANSCRIPT_SESSION_SECRET?.trim() ?? ''

  const missing = [
    !clientId && 'DISCORD_CLIENT_ID',
    !clientSecret && 'DISCORD_CLIENT_SECRET',
    !sessionSecret && 'TRANSCRIPT_SESSION_SECRET',
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new Error(
      `Transcript auth is not configured. Missing: ${missing.join(', ')}`
    )
  }

  if (sessionSecret.length < 32) {
    throw new Error('TRANSCRIPT_SESSION_SECRET must be at least 32 characters')
  }

  return {
    clientId,
    clientSecret,
    sessionSecret,
    redirectUri: `https://${transcriptDomain}/auth/callback`,
  }
}

// ---------------------------------------------------------------------------
// Signed cookies
// ---------------------------------------------------------------------------

const hmac = (secret: string, value: string): string =>
  createHmac('sha256', secret).update(value).digest('base64url')

export const signPayload = <T extends object>(
  secret: string,
  payload: T,
  ttlMs: number,
  now = Date.now()
): string => {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: now + ttlMs })
  ).toString('base64url')
  return `${body}.${hmac(secret, body)}`
}

export const verifyPayload = <T extends object>(
  secret: string,
  token: string | undefined,
  now = Date.now()
): T | null => {
  if (!token) return null

  const [body, signature, ...rest] = token.split('.')
  if (!body || !signature || rest.length > 0) return null

  const expected = Buffer.from(hmac(secret, body))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null
  }

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    ) as SignedPayload<T>
    if (typeof payload.exp !== 'number' || payload.exp < now) return null
    return payload
  } catch {
    return null
  }
}

export const parseCookies = (
  header: string | undefined
): Map<string, string> => {
  const cookies = new Map<string, string>()
  if (!header) return cookies

  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (!name || cookies.has(name)) continue
    try {
      cookies.set(name, decodeURIComponent(value))
    } catch {
      // Ignore malformed cookie values rather than failing the request.
    }
  }

  return cookies
}

export const serializeCookie = (
  name: string,
  value: string,
  maxAgeMs: number
): string =>
  [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    // Lax so the cookie is sent when someone clicks the link in Discord (a
    // cross-site top-level navigation), but not on cross-site subrequests.
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`,
  ].join('; ')

export const createSessionCookie = (
  secret: string,
  session: TranscriptSession
): string =>
  serializeCookie(
    SESSION_COOKIE,
    signPayload(secret, session, SESSION_TTL_MS),
    SESSION_TTL_MS
  )

export const clearCookie = (name: string): string =>
  serializeCookie(name, '', 0)

export const readSession = (
  secret: string,
  cookieHeader: string | undefined
): TranscriptSession | null => {
  const session = verifyPayload<TranscriptSession>(
    secret,
    parseCookies(cookieHeader).get(SESSION_COOKIE)
  )
  if (!session || typeof session.userId !== 'string') return null
  return {
    userId: session.userId,
    username: typeof session.username === 'string' ? session.username : '',
  }
}

// ---------------------------------------------------------------------------
// OAuth2
// ---------------------------------------------------------------------------

// Only ever send people back to a transcript page, so the login flow can't be
// abused as an open redirect.
export const sanitizeNextPath = (next: unknown): string | null =>
  typeof next === 'string' && /^\/transcript\/[A-Za-z0-9-]{1,64}$/.test(next)
    ? next
    : null

export const createOAuthState = (
  secret: string,
  next: string
): { state: string; cookie: string } => {
  const state = randomBytes(24).toString('base64url')
  return {
    state,
    cookie: serializeCookie(
      OAUTH_STATE_COOKIE,
      signPayload<OAuthState>(secret, { state, next }, OAUTH_STATE_TTL_MS),
      OAUTH_STATE_TTL_MS
    ),
  }
}

/** Returns the post-login redirect path if `state` matches the cookie. */
export const consumeOAuthState = (
  secret: string,
  cookieHeader: string | undefined,
  state: unknown
): string | null => {
  const stored = verifyPayload<OAuthState>(
    secret,
    parseCookies(cookieHeader).get(OAUTH_STATE_COOKIE)
  )
  if (!stored || typeof state !== 'string') return null

  const expected = Buffer.from(stored.state)
  const actual = Buffer.from(state)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null
  }

  return sanitizeNextPath(stored.next)
}

export const getAuthorizeUrl = (
  config: TranscriptAuthConfig,
  state: string
): string => {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
    // Skip the consent screen for people who've already authorised once.
    prompt: 'none',
  })
  return `https://discord.com/oauth2/authorize?${params.toString()}`
}

export const exchangeCodeForUser = async (
  config: TranscriptAuthConfig,
  code: string
): Promise<TranscriptSession> => {
  const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    }),
  })
  if (!tokenResponse.ok) {
    throw new Error(`Discord token exchange failed (${tokenResponse.status})`)
  }

  const token = (await tokenResponse.json()) as {
    access_token?: string
    token_type?: string
  }
  if (!token.access_token) {
    throw new Error('Discord token exchange returned no access token')
  }

  const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
    headers: {
      Authorization: `${token.token_type ?? 'Bearer'} ${token.access_token}`,
    },
  })
  if (!userResponse.ok) {
    throw new Error(`Discord user lookup failed (${userResponse.status})`)
  }

  const user = (await userResponse.json()) as {
    id?: string
    username?: string
    global_name?: string | null
  }
  if (!user.id) throw new Error('Discord user lookup returned no ID')

  return { userId: user.id, username: user.global_name ?? user.username ?? '' }
}

// ---------------------------------------------------------------------------
// Access checks
// ---------------------------------------------------------------------------

const PARTICIPANT_ID_PATTERN = /data-user="(\d{17,20})"/g

// Transcripts saved before `participantIds` was stored still mark every
// message author with data-user, which is exactly who spoke in the ticket.
export const extractParticipantIdsFromHtml = (html: string): Array<string> => [
  ...new Set([...html.matchAll(PARTICIPANT_ID_PATTERN)].map((m) => m[1] ?? '')),
]

export const isTranscriptParticipant = (
  userId: string,
  transcript: {
    userId: string
    participantIds?: Array<string>
    transcriptHtml: string
  }
): boolean =>
  userId === transcript.userId ||
  (
    transcript.participantIds ??
    extractParticipantIdsFromHtml(transcript.transcriptHtml)
  ).includes(userId)

let ticketGuildPromise: Promise<Guild | null> | null = null

const getTicketGuild = (client: Client): Promise<Guild | null> => {
  if (!ticketGuildPromise) {
    ticketGuildPromise = client.channels
      .fetch(channelIds.modTickets)
      .then((channel) => (channel && 'guild' in channel ? channel.guild : null))
      .catch(() => null)
      .then((guild) => {
        if (!guild) ticketGuildPromise = null
        return guild
      })
  }
  return ticketGuildPromise
}

const roleCache = new Map<
  string,
  { roleName: string | null; expires: number }
>()

export const getBypassRoleName = async (
  client: Client,
  userId: string
): Promise<string | null> => {
  const cached = roleCache.get(userId)
  if (cached && cached.expires > Date.now()) return cached.roleName

  const guild = await getTicketGuild(client)
  if (!guild) {
    throw new Error('Could not resolve the ticket guild for a role check')
  }

  const member = await guild.members
    .fetch({ user: userId, force: true })
    .catch(() => null)

  const roleName =
    BYPASS_ROLES.find((role) => member?.roles.cache.has(role.id))?.name ?? null

  const now = Date.now()
  if (roleCache.size > 1000) {
    for (const [key, entry] of roleCache) {
      if (entry.expires <= now) roleCache.delete(key)
    }
  }
  roleCache.set(userId, { roleName, expires: now + ROLE_CACHE_TTL_MS })
  return roleName
}

export const resolveTranscriptAccess = async (
  client: Client,
  userId: string,
  transcript: Parameters<typeof isTranscriptParticipant>[1]
): Promise<TranscriptAccess> => {
  if (isTranscriptParticipant(userId, transcript)) {
    return { allowed: true, bypassRole: null }
  }

  const bypassRole = await getBypassRoleName(client, userId)
  return bypassRole ? { allowed: true, bypassRole } : { allowed: false }
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

export const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      }[char] ?? char)
  )

const BANNER_STYLE = [
  'display:flex',
  'align-items:center',
  'gap:8px',
  'padding:10px 16px',
  'background:#f0b232',
  'color:#1e1f22',
  'font-family:"gg sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
  'font-size:14px',
  'font-weight:600',
].join(';')

/** Adds the staff "Bypassing for {role}" banner to the top of a transcript. */
export const injectBypassBanner = (html: string, roleName: string): string => {
  const banner = `<div id="transcript-access-banner" role="status" style="${BANNER_STYLE}">&#128737;&#65039; Bypassing for ${escapeHtml(
    roleName
  )}<span style="font-weight:400;opacity:.8">&mdash; you did not take part in this ticket and are viewing it through your staff role.</span></div>`

  const bodyTag = /<body[^>]*>/i.exec(html)
  if (!bodyTag) return banner + html

  const insertAt = bodyTag.index + bodyTag[0].length
  return html.slice(0, insertAt) + banner + html.slice(insertAt)
}

export const renderMessagePage = (
  title: string,
  message: string,
  action?: { href: string; label: string }
): string => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  html, body { margin: 0; height: 100%; background: #313338; }
  body {
    display: flex; align-items: center; justify-content: center; padding: 16px;
    box-sizing: border-box;
    font-family: "gg sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #dbdee1;
  }
  .card { max-width: 440px; width: 100%; background: #2b2d31; border-radius: 8px; padding: 24px; text-align: center; }
  h1 { margin: 0 0 8px; font-size: 20px; color: #f2f3f5; }
  p { margin: 0; line-height: 1.5; color: #b5bac1; }
  a { display: inline-block; margin-top: 20px; padding: 8px 16px; border-radius: 4px; background: #5865f2; color: #fff; text-decoration: none; font-weight: 500; }
</style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
    ${
      action
        ? `<a href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`
        : ''
    }
  </div>
</body>
</html>`
