import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { Client } from 'discord.js'
import { getTranscript, getTranscriptById } from './db/transcripts'
import { openTranscriptAssetDownloadStream } from './db/transcriptAssets'
import {
  OAUTH_STATE_COOKIE,
  TranscriptAuthConfig,
  clearCookie,
  consumeOAuthState,
  createOAuthState,
  createSessionCookie,
  exchangeCodeForUser,
  getAuthorizeUrl,
  injectBypassBanner,
  loadTranscriptAuthConfig,
  readSession,
  renderMessagePage,
  resolveTranscriptAccess,
  SESSION_COOKIE,
  sanitizeNextPath,
} from './transcriptAuth'

const PORT = parseInt(process.env.WEB_SERVER_PORT ?? '3000', 10)
const TRANSCRIPT_DOMAIN = process.env.TRANSCRIPT_DOMAIN ?? 'localhost:3000'

// Transcript HTML can embed user-submitted message content; a strict CSP
// blocks it from executing scripts or phoning home if anything slipped
// through unescaped.
// Avatars and embedded screenshots in transcripts are hotlinked from
// Discord's CDN, so img-src has to allow those hosts. The transcript page
// also ships its own inline <script> (profile popup, export button) that
// needs script-src; message content is HTML-escaped before it ever reaches
// the page, so allowing inline script here doesn't reopen that up to
// injected user content. Re-hosted videos are served from this origin.
const TRANSCRIPT_CSP =
  "default-src 'none'; img-src 'self' data: https://cdn.discordapp.com https://media.discordapp.net; media-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
const MESSAGE_PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'"

let app: Express | null = null

// Applied per-route below; bounds how hard a single client can hammer the
// DB/asset storage and the Discord OAuth endpoints.
const transcriptLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
})

const sendMessagePage = (
  res: Response,
  status: number,
  title: string,
  message: string,
  action?: { href: string; label: string }
): void => {
  res.status(status)
  res.setHeader('Content-Security-Policy', MESSAGE_PAGE_CSP)
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(renderMessagePage(title, message, action))
}

const loginPath = (next: string): string =>
  `/auth/login?next=${encodeURIComponent(next)}`

export const startWebServer = async (client: Client): Promise<void> => {
  if (app) {
    return
  }

  // Fail closed: without OAuth credentials there's no way to check access,
  // so don't serve transcripts at all.
  const auth: TranscriptAuthConfig = loadTranscriptAuthConfig(TRANSCRIPT_DOMAIN)

  app = express()

  // Running behind a reverse proxy in production; trust the first hop so
  // express-rate-limit can read the real client IP from X-Forwarded-For.
  app.set('trust proxy', 1)

  app.use(cors())
  app.use(express.json())

  app.get('/auth/login', transcriptLimiter, (req: Request, res: Response) => {
    const next = sanitizeNextPath(req.query.next)
    if (!next) {
      sendMessagePage(
        res,
        400,
        'Invalid link',
        'Open a transcript link from Discord to sign in.'
      )
      return
    }

    const { state, cookie } = createOAuthState(auth.sessionSecret, next)
    res.setHeader('Set-Cookie', cookie)
    res.setHeader('Cache-Control', 'no-store')
    res.redirect(302, getAuthorizeUrl(auth, state))
  })

  app.get(
    '/auth/callback',
    transcriptLimiter,
    async (req: Request, res: Response): Promise<void> => {
      const next = consumeOAuthState(
        auth.sessionSecret,
        req.headers.cookie,
        req.query.state
      )
      const clearState = clearCookie(OAUTH_STATE_COOKIE)

      if (!next) {
        res.setHeader('Set-Cookie', clearState)
        sendMessagePage(
          res,
          400,
          'Sign-in expired',
          'Your sign-in attempt expired or was started in another browser. Open the transcript link again to retry.'
        )
        return
      }

      const code = req.query.code
      if (typeof code !== 'string' || !code) {
        res.setHeader('Set-Cookie', clearState)
        sendMessagePage(
          res,
          401,
          'Sign-in cancelled',
          'You need to sign in with Discord to view this transcript.',
          { href: loginPath(next), label: 'Try again' }
        )
        return
      }

      try {
        const session = await exchangeCodeForUser(auth, code)
        res.setHeader('Set-Cookie', [
          clearState,
          createSessionCookie(auth.sessionSecret, session),
        ])
        res.setHeader('Cache-Control', 'no-store')
        res.redirect(302, next)
      } catch (error) {
        console.error('Transcript OAuth callback failed:', error)
        res.setHeader('Set-Cookie', clearState)
        sendMessagePage(
          res,
          502,
          'Sign-in failed',
          'We could not verify your Discord account. Please try again in a moment.',
          { href: loginPath(next), label: 'Try again' }
        )
      }
    }
  )

  app.get('/auth/logout', (_req: Request, res: Response) => {
    res.setHeader('Set-Cookie', clearCookie(SESSION_COOKIE))
    sendMessagePage(
      res,
      200,
      'Signed out',
      'You have been signed out of transcript viewing.'
    )
  })

  app.get(
    '/transcript/:transcriptId',
    transcriptLimiter,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const transcriptId = req.params.transcriptId

        if (!transcriptId || typeof transcriptId !== 'string') {
          res.status(400).json({ error: 'Transcript ID is required' })
          return
        }

        // Check the session before touching the DB so unauthenticated
        // visitors can't probe which transcript IDs exist.
        const session = readSession(auth.sessionSecret, req.headers.cookie)
        if (!session) {
          const next = sanitizeNextPath(`/transcript/${transcriptId}`)
          if (!next) {
            sendMessagePage(
              res,
              404,
              'Transcript not found',
              'This transcript does not exist or has expired.'
            )
            return
          }
          res.setHeader('Cache-Control', 'no-store')
          res.redirect(302, loginPath(next))
          return
        }

        const transcript = await getTranscriptById(transcriptId)

        if (!transcript) {
          sendMessagePage(
            res,
            404,
            'Transcript not found',
            'This transcript does not exist or has expired. Transcripts are kept for 90 days after a ticket is resolved.'
          )
          return
        }

        const access = await resolveTranscriptAccess(
          client,
          session.userId,
          transcript
        )

        if (!access.allowed) {
          sendMessagePage(
            res,
            403,
            'No access',
            `You're signed in as ${
              session.username || session.userId
            }, who didn't take part in this ticket. Only ticket participants and staff can view this transcript.`,
            { href: '/auth/logout', label: 'Sign out' }
          )
          return
        }

        res.setHeader('Content-Security-Policy', TRANSCRIPT_CSP)
        // Access depends on who's signed in, so never let a shared cache (or
        // the browser, after sign-out) hand this page to someone else.
        res.setHeader('Cache-Control', 'private, no-store')
        res.setHeader('Vary', 'Cookie')
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.send(
          access.bypassRole
            ? injectBypassBanner(transcript.transcriptHtml, access.bypassRole)
            : transcript.transcriptHtml
        )
      } catch (error) {
        console.error('Error serving transcript:', error)
        res.status(500).json({ error: 'Internal server error' })
      }
    }
  )

  app.get(
    '/transcript-asset/:assetId',
    transcriptLimiter,
    async (req: Request, res: Response): Promise<void> => {
      try {
        const assetId = req.params.assetId

        if (!assetId || typeof assetId !== 'string') {
          res.status(400).json({ error: 'Asset ID is required' })
          return
        }

        const session = readSession(auth.sessionSecret, req.headers.cookie)
        if (!session) {
          res.status(401).json({ error: 'Sign in required' })
          return
        }

        const asset = await openTranscriptAssetDownloadStream(assetId)
        // Asset IDs are sequential ObjectIds, so treat "exists but you can't
        // see it" the same as "doesn't exist" to avoid an enumeration oracle.
        const transcript = asset?.threadId
          ? await getTranscript(asset.threadId)
          : null
        const access = transcript
          ? await resolveTranscriptAccess(client, session.userId, transcript)
          : null

        if (!asset || !access?.allowed) {
          asset?.stream.destroy()
          res.status(404).json({ error: 'Asset not found' })
          return
        }

        res.setHeader('Content-Type', asset.contentType)
        res.setHeader(
          'Content-Disposition',
          `inline; filename="${encodeURIComponent(asset.filename)}"`
        )
        if (asset.length) {
          res.setHeader('Content-Length', String(asset.length))
        }
        // Assets never change, but access is per-user and expires, so only the
        // viewer's own browser may cache them, and only briefly.
        res.setHeader('Cache-Control', 'private, max-age=3600')
        res.setHeader('Vary', 'Cookie')

        asset.stream.on('error', (error) => {
          console.error('Error streaming transcript asset:', error)
          res.destroy()
        })
        asset.stream.pipe(res)
      } catch (error) {
        console.error('Error serving transcript asset:', error)
        res.status(500).json({ error: 'Internal server error' })
      }
    }
  )

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' })
  })

  return new Promise<void>((resolve, reject) => {
    const server = app!.listen(PORT, () => {
      console.log(`Web server running on http://localhost:${PORT}`)
      resolve()
    })
    server.on('error', (error) => {
      app = null
      reject(error)
    })
  })
}

export const getTranscriptUrl = (transcriptId: string): string => {
  return `https://${TRANSCRIPT_DOMAIN}/transcript/${encodeURIComponent(
    transcriptId
  )}`
}

export const getTranscriptAssetUrl = (assetId: string): string => {
  return `https://${TRANSCRIPT_DOMAIN}/transcript-asset/${encodeURIComponent(
    assetId
  )}`
}
