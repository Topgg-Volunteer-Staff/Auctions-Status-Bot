import { Client } from 'discord.js'
import cron from 'node-cron'

import { deleteExpiredTranscriptAssets } from '../db/transcriptAssets'
import { deleteExpiredTranscripts } from '../db/transcripts'
import { sendErrorLog } from '../errorLogging'

const sweepExpiredTranscripts = async (client: Client): Promise<void> => {
  try {
    const transcripts = await deleteExpiredTranscripts()
    const assets = await deleteExpiredTranscriptAssets()

    if (transcripts > 0 || assets > 0) {
      console.log(
        `Transcript expiry sweep removed transcripts from ${transcripts} user record(s) and ${assets} asset(s)`
      )
    }
  } catch (error) {
    await sendErrorLog(client, 'transcripts.expirySweep.failed', error).catch(
      () => void 0
    )
  }
}

/** Deletes transcripts and their assets once they pass the 90-day TTL. */
export const startTranscriptExpirySweep = (client: Client): void => {
  void sweepExpiredTranscripts(client)

  cron.schedule('30 * * * *', () => {
    void sweepExpiredTranscripts(client)
  })
}
