// scripts/commands-cli.ts
import fs from 'node:fs'
import path from 'node:path'
import * as dotenv from 'dotenv'
import { REST } from '@discordjs/rest'
import { Routes } from 'discord.js'
import type {
  APIApplicationCommand,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord-api-types/v10'

// -------------------- ENV --------------------
dotenv.config({ path: path.join(process.cwd(), '.env') })

const TOKEN = process.env.DISCORD_TOKEN ?? ''
const CLIENT_ID = process.env.DISCORD_CLIENT_ID ?? ''
const DEFAULT_GUILD_ID = process.env.DISCORD_GUILD_ID ?? ''

if (!TOKEN || !CLIENT_ID) {
  const missing = [
    !TOKEN ? 'DISCORD_TOKEN' : null,
    !CLIENT_ID ? 'DISCORD_CLIENT_ID' : null,
  ]
    .filter((x): x is string => Boolean(x))
    .join(', ')
  console.error(`Missing required env(s): ${missing}`)
  process.exit(1)
}

const rest = new REST({ version: '10' }).setToken(TOKEN)

// -------------------- PATHS & DISCOVERY --------------------
const candidateDirs: Array<string> = [
  process.env.COMMANDS_DIR ?? '',
  path.join(process.cwd(), 'commands'),
  path.join(process.cwd(), 'src', 'commands'),
  path.join(process.cwd(), 'src', 'interactions', 'slash-commands'),
  path.join(process.cwd(), 'dist', 'commands'),
].filter((p) => p.length > 0)

const findCommandsDir = (): string => {
  for (const p of candidateDirs) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p
    } catch {
      // ignore FS errors and keep searching
    }
  }
  throw new Error(
    `Could not locate commands directory. Checked:\n - ${candidateDirs.join(
      '\n - '
    )}\nSet COMMANDS_DIR to point at your commands folder.`
  )
}

const commandsPath = findCommandsDir()

// -------------------- HELPERS --------------------
const isCodeFile = (filePath: string): boolean => {
  const lower = filePath.toLowerCase()
  return (
    (lower.endsWith('.ts') ||
      lower.endsWith('.js') ||
      lower.endsWith('.mjs') ||
      lower.endsWith('.cjs')) &&
    !lower.endsWith('.d.ts') &&
    !lower.endsWith('.map')
  )
}

type CommandLike = {
  toJSON: () => RESTPostAPIChatInputApplicationCommandsJSONBody
}

const pickCommandExport = (mod: unknown): CommandLike | null => {
  if (typeof mod !== 'object' || mod === null) return null

  const tryList: Array<unknown> = [
    (mod as { command?: unknown }).command,
    (mod as { default?: { command?: unknown } }).default?.command,
    (mod as { default?: unknown }).default,
  ]

  for (const cand of tryList) {
    if (
      cand !== null &&
      typeof cand === 'object' &&
      typeof (cand as { toJSON?: unknown }).toJSON === 'function'
    ) {
      return cand as CommandLike
    }
  }
  return null
}

const loadLocalCommands = async (): Promise<
  Array<RESTPostAPIChatInputApplicationCommandsJSONBody>
> => {
  const entries = fs.readdirSync(commandsPath, { withFileTypes: true })
  const codeFiles: Array<string> = []

  for (const d of entries) {
    if (d.isDirectory()) {
      const sub = path.join(commandsPath, d.name)
      const subFiles = fs.readdirSync(sub, { withFileTypes: true })
      for (const f of subFiles) {
        if (f.isFile()) {
          const full = path.join(sub, f.name)
          if (isCodeFile(full)) codeFiles.push(full)
        }
      }
    } else if (d.isFile()) {
      const full = path.join(commandsPath, d.name)
      if (isCodeFile(full)) codeFiles.push(full)
    }
  }

  const out: Array<RESTPostAPIChatInputApplicationCommandsJSONBody> = []
  for (const full of codeFiles) {
    try {
      // Use file URL style import for Windows & ESM interop safety
      const modUnknown: unknown = await import(pathToFileURLSafe(full))
      const cmd = pickCommandExport(modUnknown)
      if (!cmd) {
        console.warn(
          `[commands] Skipped "${path.relative(
            process.cwd(),
            full
          )}" (no export with toJSON())`
        )
        continue
      }
      out.push(cmd.toJSON())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(
        `[commands] Failed to import "${path.relative(
          process.cwd(),
          full
        )}": ${msg}`
      )
    }
  }

  if (out.length === 0) {
    console.warn(
      `No commands found in ${commandsPath}. If your files live elsewhere, set COMMANDS_DIR=/abs/path/to/commands`
    )
  }
  return out
}

const pathToFileURLSafe = (p: string): string => {
  // Works for both POSIX and Windows paths
  const { pathToFileURL } = require('node:url') as {
    pathToFileURL: (s: string) => URL
  }
  return pathToFileURL(p).href
}

const ensureGuildId = (maybe: string | undefined): string => {
  const gid = (maybe ?? DEFAULT_GUILD_ID).trim()
  if (!gid) {
    throw new Error(
      'No guild id provided. Pass one as an arg or set DISCORD_GUILD_ID in your .env'
    )
  }
  return gid
}

// -------------------- ACTIONS --------------------
const registerGlobal = async (): Promise<void> => {
  const body = await loadLocalCommands()
  const res = (await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body,
  })) as Array<APIApplicationCommand>
  console.log(`Registered ${res.length} global command(s).`)
}

const unregisterGlobal = async (): Promise<void> => {
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] })
  console.log('Unregistered ALL global commands.')
}

const registerGuild = async (guildIdInput?: string): Promise<void> => {
  const guildId = ensureGuildId(guildIdInput)
  const body = await loadLocalCommands()
  const res = (await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, guildId),
    { body }
  )) as Array<APIApplicationCommand>
  console.log(`Registered ${res.length} guild command(s) in ${guildId}.`)
}

const unregisterGuild = async (guildIdInput?: string): Promise<void> => {
  const guildId = ensureGuildId(guildIdInput)
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), {
    body: [],
  })
  console.log(`Unregistered ALL guild commands in ${guildId}.`)
}

const listCommands = async (
  scope: 'global' | 'guild',
  guildIdInput?: string
): Promise<void> => {
  const route =
    scope === 'global'
      ? Routes.applicationCommands(CLIENT_ID)
      : Routes.applicationGuildCommands(CLIENT_ID, ensureGuildId(guildIdInput))

  const cmds = (await rest.get(route)) as Array<APIApplicationCommand>
  console.log(
    `${scope.toUpperCase()} commands${
      scope === 'guild' ? ` (${ensureGuildId(guildIdInput)})` : ''
    }: ${cmds.length ? cmds.map((c) => c.name).join(', ') : '(none)'}`
  )
}

// -------------------- CLI --------------------
const [, , cmd, maybeGuildId] = process.argv

const help = (): void => {
  console.log(`
Usage:
  # Global
  pnpm cmd register:global
  pnpm cmd unregister:global
  pnpm cmd list:global

  # Guild (provide guild id arg or set DISCORD_GUILD_ID)
  pnpm cmd register:guild [GUILD_ID]
  pnpm cmd unregister:guild [GUILD_ID]
  pnpm cmd list:guild [GUILD_ID]

Env:
  - DISCORD_TOKEN (required)
  - DISCORD_CLIENT_ID (required)
  - DISCORD_GUILD_ID (optional default for guild ops)
  - COMMANDS_DIR (optional override; found: ${commandsPath})

Notes:
  - .env is loaded from: ${path.join(process.cwd(), '.env')}
  - Files may live under subfolders; CLI scans one level deep.
  - Export styles supported: 
      export const command = new SlashCommandBuilder()...
      export default { command: new SlashCommandBuilder()... }
      export default new SlashCommandBuilder()...
`)
}

;(async () => {
  try {
    switch (cmd) {
      case 'register:global':
        await registerGlobal()
        break
      case 'unregister:global':
        await unregisterGlobal()
        break
      case 'list:global':
        await listCommands('global')
        break
      case 'register:guild':
        await registerGuild(maybeGuildId)
        break
      case 'unregister:guild':
        await unregisterGuild(maybeGuildId)
        break
      case 'list:guild':
        await listCommands('guild', maybeGuildId)
        break
      default:
        help()
        process.exit(cmd ? 1 : 0)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(msg)
    process.exit(1)
  }
})()
