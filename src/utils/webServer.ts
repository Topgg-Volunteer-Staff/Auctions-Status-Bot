import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import { getTranscriptById } from './db/transcripts'
import { openTranscriptAssetDownloadStream } from './db/transcriptAssets'

const PORT = parseInt(process.env.WEB_SERVER_PORT ?? '3000', 10)
const TRANSCRIPT_DOMAIN = process.env.TRANSCRIPT_DOMAIN ?? 'localhost:3000'

let app: Express | null = null

// Applied per-route below; keeps transcript links usable without auth while
// bounding how hard a single client can hammer the DB/asset storage.
const transcriptLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
})

export const startWebServer = async (): Promise<void> => {
  if (app) {
    return
  }

  app = express()

  // Running behind a reverse proxy in production; trust the first hop so
  // express-rate-limit can read the real client IP from X-Forwarded-For.
  app.set('trust proxy', 1)

  app.use(cors())
  app.use(express.json())

  app.get('/transcript/:transcriptId', transcriptLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
      const transcriptId = req.params.transcriptId

      if (!transcriptId || typeof transcriptId !== 'string') {
        res.status(400).json({ error: 'Transcript ID is required' })
        return
      }

      const transcript = await getTranscriptById(transcriptId)

      if (!transcript) {
        res.status(404).json({ error: 'Transcript not found' })
        return
      }

      // Transcript HTML can embed user-submitted message content; a strict
      // CSP blocks it from executing scripts or phoning home if anything
      // slipped through unescaped.
      // Avatars and embedded screenshots in transcripts are hotlinked from
      // Discord's CDN, so img-src has to allow those hosts. The transcript
      // page also ships its own inline <script> (profile popup, export
      // button) that needs script-src; message content is HTML-escaped
      // before it ever reaches the page, so allowing inline script here
      // doesn't reopen that up to injected user content.
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src 'self' data: https://cdn.discordapp.com https://media.discordapp.net; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
      )
      // Transcripts are immutable once a ticket is resolved — safe to cache
      // in the requester's browser indefinitely.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(transcript.transcriptHtml)
    } catch (error) {
      console.error('Error serving transcript:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  app.get('/transcript-asset/:assetId', transcriptLimiter, async (req: Request, res: Response): Promise<void> => {
    try {
      const assetId = req.params.assetId

      if (!assetId || typeof assetId !== 'string') {
        res.status(400).json({ error: 'Asset ID is required' })
        return
      }

      const asset = await openTranscriptAssetDownloadStream(assetId)

      if (!asset) {
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
      // Assets are immutable once uploaded — cache them aggressively.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

      asset.stream.on('error', (error) => {
        console.error('Error streaming transcript asset:', error)
        res.destroy()
      })
      asset.stream.pipe(res)
    } catch (error) {
      console.error('Error serving transcript asset:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

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
  return `https://${TRANSCRIPT_DOMAIN}/transcript/${encodeURIComponent(transcriptId)}`
}

export const getTranscriptAssetUrl = (assetId: string): string => {
  return `https://${TRANSCRIPT_DOMAIN}/transcript-asset/${encodeURIComponent(assetId)}`
}
