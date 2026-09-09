import express, { Express, Request, Response } from 'express'
import cors from 'cors'
import { getTranscriptById } from './db/transcripts'

const PORT = parseInt(process.env.WEB_SERVER_PORT ?? '3000', 10)
const TRANSCRIPT_DOMAIN = process.env.TRANSCRIPT_DOMAIN ?? 'localhost:3000'

let app: Express | null = null

export const startWebServer = async (): Promise<void> => {
  if (app) {
    return
  }

  app = express()

  app.use(cors())
  app.use(express.json())

  app.get('/transcript/:transcriptId', async (req: Request, res: Response): Promise<void> => {
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

      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(transcript.transcriptHtml)
    } catch (error) {
      console.error('Error serving transcript:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  })

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' })
  })

  return new Promise<void>((resolve) => {
    app!.listen(PORT, () => {
      console.log(`Web server running on http://localhost:${PORT}`)
      resolve()
    })
  })
}

export const getTranscriptUrl = (transcriptId: string): string => {
  return `https://${TRANSCRIPT_DOMAIN}/transcript/${transcriptId}`
}
