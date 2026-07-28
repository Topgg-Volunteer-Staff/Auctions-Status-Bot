import {
  Client,
  MessageFlags,
  TextBasedChannel,
  TextChannel,
  TextDisplayBuilder,
} from 'discord.js'
import { createTextPanel } from './componentsV2'

const ERROR_LOG_CHANNEL_ID = '396848636081733632'
const MONGO_ERROR_MENTION = '<@884516044151083079>'
const MAX_FIELD_VALUE = 1024
const MAX_DESCRIPTION = 3992
const ERROR_BURST_WINDOW_MS = 30_000

type ErrorMetaValue = string | number | boolean | null | undefined
type ErrorMeta = Record<string, ErrorMetaValue>
type ErrorLogOptions = {
  content?: string
  allowedMentions?: {
    users?: Array<string>
  }
}
type ErrorBurstState = {
  lastSentAt: number
  warnedAt: number | null
}

let consoleForwardingInstalled = false
let processHandlersInstalled = false
let consoleForwardQueue: Promise<void> = Promise.resolve()
const errorBurstState = new Map<string, ErrorBurstState>()

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max - 3)}...` : value

const splitTextDisplayContent = (content: string): Array<string> => {
  const chunks: Array<string> = []
  let remaining = content

  while (remaining.length > 4_000) {
    const newlineIndex = remaining.lastIndexOf('\n', 4_000)
    const splitIndex = newlineIndex > 2_000 ? newlineIndex : 4_000
    chunks.push(remaining.slice(0, splitIndex))
    remaining = remaining.slice(splitIndex).replace(/^\n/, '')
  }

  if (remaining) chunks.push(remaining)
  return chunks
}

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack || error.message || String(error)
  }
  if (typeof error === 'string') return error
  return safeStringify(error)
}

const buildErrorSignature = (title: string, description: string): string =>
  `${title}\n${description}`

const shouldSkipBurst = (
  signature: string,
  now: number
): { skip: boolean; sendNotice: boolean } => {
  const existing = errorBurstState.get(signature)

  if (!existing || now - existing.lastSentAt > ERROR_BURST_WINDOW_MS) {
    errorBurstState.set(signature, {
      lastSentAt: now,
      warnedAt: null,
    })
    return { skip: false, sendNotice: false }
  }

  existing.lastSentAt = now

  if (existing.warnedAt === null) {
    existing.warnedAt = now
    return { skip: true, sendNotice: true }
  }

  return { skip: true, sendNotice: false }
}

const sendBurstNotice = async (channel: TextChannel): Promise<void> => {
  await channel.send(
    'More errors have occurred, but I am slowing down to avoid rate limiting the Discord API.'
  )
}

const sendErrorLogMessage = async (
  client: Client,
  title: string,
  error: unknown,
  meta?: ErrorMeta,
  options?: ErrorLogOptions
): Promise<void> => {
  const channel = await getLogChannel(client)
  if (!channel) {
    process.stderr.write(
      `[errorLogging] Could not find text channel ${ERROR_LOG_CHANNEL_ID}\n`
    )
    return
  }

  const description = truncate(formatError(error), MAX_DESCRIPTION)
  const burst = shouldSkipBurst(
    buildErrorSignature(title, description),
    Date.now()
  )

  if (burst.sendNotice) {
    await sendBurstNotice(channel).catch(() => void 0)
  }

  if (burst.skip) {
    return
  }

  const panel = createTextPanel({
    accentColor: 0xff0000,
    title,
    description: `\`\`\`\n${description}\n\`\`\``,
  })

  if (meta) {
    const fields = Object.entries(meta)
      .filter(([, value]) => value !== undefined)
      .slice(0, 10)
      .map(([key, value]) => ({
        name: truncate(key, 256),
        value: truncate(String(value), MAX_FIELD_VALUE),
      }))

    if (fields.length > 0) {
      const metadata = fields
        .map(({ name, value }) => `**${name}**\n${value}`)
        .join('\n\n')

      panel.addTextDisplayComponents(
        splitTextDisplayContent(metadata).map((content) =>
          new TextDisplayBuilder().setContent(content)
        )
      )
    }
  }

  panel.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# <t:${Math.floor(Date.now() / 1000)}:f>`
    )
  )

  if (options?.content) {
    panel.spliceComponents(
      0,
      0,
      new TextDisplayBuilder().setContent(options.content)
    )
  }

  await channel.send({
    components: [panel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: {
      parse: [],
      ...(options?.allowedMentions?.users
        ? { users: options.allowedMentions.users }
        : {}),
    },
  })
}

const isTextSendable = (
  channel: TextBasedChannel | null
): channel is TextChannel => {
  if (!channel) return false
  return 'send' in channel && typeof channel.send === 'function'
}

const getLogChannel = async (client: Client): Promise<TextChannel | null> => {
  const cached = client.channels.cache.get(ERROR_LOG_CHANNEL_ID)
  if (cached && cached.isTextBased() && isTextSendable(cached)) return cached

  const fetched = await client.channels
    .fetch(ERROR_LOG_CHANNEL_ID)
    .catch(() => null)
  if (!fetched || !fetched.isTextBased()) return null
  return isTextSendable(fetched) ? fetched : null
}

export const sendErrorLog = async (
  client: Client,
  title: string,
  error: unknown,
  meta?: ErrorMeta
): Promise<void> => {
  await sendErrorLogMessage(client, title, error, meta)
}

export const sendMongoErrorLog = async (
  client: Client,
  title: string,
  error: unknown,
  meta?: ErrorMeta
): Promise<void> => {
  await sendErrorLogMessage(client, title, error, meta, {
    content: MONGO_ERROR_MENTION,
    allowedMentions: {
      users: ['884516044151083079'],
    },
  })
}

export const installConsoleErrorForwarding = (client: Client): void => {
  if (consoleForwardingInstalled) return
  consoleForwardingInstalled = true

  const originalConsoleError = console.error.bind(console)

  console.error = (...args: Array<unknown>) => {
    originalConsoleError(...args)

    const err =
      args.length === 1
        ? args[0]
        : args
            .map((value) =>
              typeof value === 'string' ? value : safeStringify(value)
            )
            .join(' ')

    consoleForwardQueue = consoleForwardQueue
      .then(() =>
        sendErrorLog(client, 'console.error', err, {
          pid: process.pid,
          node: process.version,
        })
      )
      .catch(() => void 0)
  }
}

export const installGlobalErrorHandlers = (client: Client): void => {
  if (processHandlersInstalled) return
  processHandlersInstalled = true

  process.on('uncaughtException', (err) => {
    void sendErrorLog(client, 'uncaughtException', err)
  })

  process.on('unhandledRejection', (reason) => {
    void sendErrorLog(client, 'unhandledRejection', reason)
  })

  client.on('error', (err) => {
    void sendErrorLog(client, 'client.error', err)
  })

  client.on('shardError', (err, shardId) => {
    void sendErrorLog(client, 'client.shardError', err, { shardId })
  })
}

export { ERROR_LOG_CHANNEL_ID }
