// scripts/commands-cli.ts
import fs from 'node:fs'
import path from 'node:path'
import { REST } from '@discordjs/rest'
import { Routes, SlashCommandBuilder } from 'discord.js'
import type {
  APIApplicationCommand,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord-api-types/v10'
import 'dotenv/config'
import * as dotenv from 'dotenv'

dotenv.config({
  // looks in repo root even if running from dist/scripts/...
  path: path.join(process.cwd(), '.env'),
})
// -------- env ----------
const TOKEN = process.env.DISCORD_TOKEN || ''
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || ''
const DEFAULT_GUILD_ID = process.env.DISCORD_GUILD_ID || ''

if (!TOKEN || !CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID.')
  process.exit(1)
}

const rest = new REST({ version: '10' }).setToken(TOKEN)

// -------- paths (adjust if different) --------
const commandsPath = path.join(__dirname, '..', 'commands')

// -------- types / helpers ----------
type CommandModule = {
  command: SlashCommandBuilder
  execute?: (...args: any[]) => any
}

const isCodeFile = (file: string) =>
  /\.(mjs|cjs|js|ts)$/.test(file) &&
  !file.endsWith('.d.ts') &&
  !file.endsWith('.map')

const loadLocalCommands = async (): Promise<
  RESTPostAPIChatInputApplicationCommandsJSONBody[]
> => {
  const files = fs.existsSync(commandsPath) ? fs.readdirSync(commandsPath) : []
  const out: RESTPostAPIChatInputApplicationCommandsJSONBody[] = []

  for (const file of files) {
    if (!isCodeFile(file)) continue
    const mod = (await import(
      path.join(commandsPath, file)
    )) as unknown as CommandModule
    if (!mod?.command || !(mod.command instanceof SlashCommandBuilder)) {
      console.warn(
        `[commands] Skipped "${file}" (missing valid SlashCommandBuilder export)`
      )
      continue
    }
    out.push(mod.command.toJSON())
  }
  return out
}

// -------- actions ----------
const registerGlobal = async () => {
  const body = await loadLocalCommands()
  const res = (await rest.put(Routes.applicationCommands(CLIENT_ID), {
    body,
  })) as APIApplicationCommand[]
  console.log(`Registered ${res.length} global command(s).`)
}

const unregisterGlobal = async () => {
  // Overwrite with an empty array to delete all global commands in bulk
  await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] })
  console.log('Unregistered ALL global commands.')
}

const registerGuild = async (guildId: string) => {
  const body = await loadLocalCommands()
  const res = (await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, guildId),
    { body }
  )) as APIApplicationCommand[]
  console.log(`Registered ${res.length} guild command(s) in ${guildId}.`)
}

const unregisterGuild = async (guildId: string) => {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), {
    body: [],
  })
  console.log(`Unregistered ALL guild commands in ${guildId}.`)
}

const list = async (scope: 'global' | 'guild', guildId?: string) => {
  const route =
    scope === 'global'
      ? Routes.applicationCommands(CLIENT_ID)
      : Routes.applicationGuildCommands(CLIENT_ID, guildId!)

  const cmds = (await rest.get(route)) as APIApplicationCommand[]
  console.log(
    `${scope.toUpperCase()} commands${guildId ? ` (${guildId})` : ''}: ${
      cmds.length ? cmds.map((c) => c.name).join(', ') : '(none)'
    }`
  )
}

// -------- CLI parsing ----------
const [, , cmd, maybeGuildId] = process.argv

const help = () => {
  console.log(`
Usage:
  # Global
  pnpm cmd register:global
  pnpm cmd unregister:global
  pnpm cmd list:global

  # Guild (provide guild id or use DISCORD_GUILD_ID)
  pnpm cmd register:guild [GUILD_ID]
  pnpm cmd unregister:guild [GUILD_ID]
  pnpm cmd list:guild [GUILD_ID]

Notes:
- Requires DISCORD_TOKEN and DISCORD_CLIENT_ID in env.
- Commands are loaded from ${commandsPath}
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
        await list('global')
        break

      case 'register:guild':
        await registerGuild(maybeGuildId || DEFAULT_GUILD_ID || '')
        break
      case 'unregister:guild':
        await unregisterGuild(maybeGuildId || DEFAULT_GUILD_ID || '')
        break
      case 'list:guild':
        await list('guild', maybeGuildId || DEFAULT_GUILD_ID || '')
        break

      default:
        help()
        process.exit(cmd ? 1 : 0)
    }
  } catch (err: any) {
    console.error(`Command failed: ${cmd || '(none)'}`)
    console.error(err?.message || err)
    process.exit(1)
  }
})()
