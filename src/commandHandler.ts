import fs from 'node:fs'
import path from 'node:path'
import { REST } from '@discordjs/rest'
import {
  Client,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js'
import type {
  APIApplicationCommand,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord-api-types/v10'

// --- Paths / REST ---
const commandsPath = path.join(__dirname, 'commands')
const buttonsPath = path.join(__dirname, 'buttons')
const modalsPath = path.join(__dirname, 'modals')
const menusPath = path.join(__dirname, 'menus')

const rest = new REST({ version: '10' }).setToken(
  process.env.DISCORD_TOKEN || ''
)

// --- Module shapes ---
type CommandExecute = (
  client: Client,
  interaction: ChatInputCommandInteraction
) => Promise<unknown> | unknown

type ButtonExecute = (
  client: Client,
  interaction: ButtonInteraction
) => Promise<unknown> | unknown

type ModalExecute = (
  client: Client,
  interaction: ModalSubmitInteraction
) => Promise<unknown> | unknown

type MenuExecute = (
  client: Client,
  interaction: StringSelectMenuInteraction
) => Promise<unknown> | unknown

interface CommandModule {
  command: SlashCommandBuilder
  execute: CommandExecute
}

interface ButtonModule {
  button: { name: string }
  execute: ButtonExecute
}

interface ModalModule {
  modal: { name: string }
  execute: ModalExecute
}

interface MenuModule {
  menu: { name: string }
  execute: MenuExecute
}

// --- Registries (typed; no any) ---
const commands: Array<{
  name: string
  data: SlashCommandBuilder
  execute: CommandExecute
}> = []

const buttons: Array<{
  name: string
  execute: ButtonExecute
}> = []

const modals: Array<{
  name: string
  execute: ModalExecute
}> = []

const menus: Array<{
  name: string
  execute: MenuExecute
}> = []

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null

// --- Type guards for dynamic imports ---
const isCommandModule = (m: unknown): m is CommandModule =>
  !!m &&
  typeof (m as CommandModule).execute === 'function' &&
  (m as CommandModule).command instanceof SlashCommandBuilder

const isButtonModule = (m: unknown): m is ButtonModule =>
  isObject(m) &&
  typeof (m as Record<string, unknown>).execute === 'function' &&
  isObject((m as Record<string, unknown>).button) &&
  typeof (m as { button: { name: unknown } }).button.name === 'string'

const isModalModule = (m: unknown): m is ModalModule =>
  isObject(m) &&
  typeof (m as Record<string, unknown>).execute === 'function' &&
  isObject((m as Record<string, unknown>).modal) &&
  typeof (m as { modal: { name: unknown } }).modal.name === 'string'

const isMenuModule = (m: unknown): m is MenuModule =>
  isObject(m) &&
  typeof (m as Record<string, unknown>).execute === 'function' &&
  isObject((m as Record<string, unknown>).menu) &&
  typeof (m as { menu: { name: unknown } }).menu.name === 'string'

// --- Helpers ---
const isCodeFile = (file: string): boolean =>
  /\.(mjs|cjs|js|ts)$/.test(file) &&
  !file.endsWith('.d.ts') &&
  !file.endsWith('.map')

export const commandHandler = async (client: Client) => {
  // reset registries (in case of hot-reload)
  commands.length = 0
  buttons.length = 0
  modals.length = 0
  menus.length = 0

  // ---- Load commands ----
  for (const file of fs.readdirSync(commandsPath)) {
    if (!isCodeFile(file)) continue
    try {
      const mod = (await import(path.join(commandsPath, file))) as unknown
      if (!isCommandModule(mod)) {
        console.warn(
          `[commands] Skipped "${file}" (missing {command, execute})`
        )
        continue
      }
      const name = mod.command.name
      commands.push({ name, data: mod.command, execute: mod.execute })
      console.log('Registered command:', name)
    } catch (err) {
      console.error(`[commands] Failed to load "${file}"`, err)
    }
  }

  // ---- Decide whether to deploy ----
  const clientId = process.env.DISCORD_CLIENT_ID || ''
  const guildId = process.env.DISCORD_GUILD_ID || '333949691962195969' // fast guild deploy

  const commandsData: Array<RESTPostAPIChatInputApplicationCommandsJSONBody> =
    commands.map((c) => c.data.toJSON())

  // Compare local vs remote (scoped to where we plan to deploy)
  const hasNonSyncedChanges = async (): Promise<boolean> => {
    const route = guildId
      ? Routes.applicationGuildCommands(clientId, guildId)
      : Routes.applicationCommands(clientId)

    const remote = (await rest.get(
      route
    )) as unknown as Array<APIApplicationCommand>

    if (remote.length !== commandsData.length) return true

    // quick name set diffs
    const remoteNames = new Set(remote.map((r) => r.name))
    const localNames = new Set(commands.map((c) => c.name))
    if (remote.some((r) => !localNames.has(r.name))) return true
    if (commands.some((c) => !remoteNames.has(c.name))) return true

    // shallow compare some important fields
    for (const c of commands) {
      const r = remote.find((x) => x.name === c.name)
      if (!r) return true

      // Note: APIApplicationCommand for chat input has description; compare those
      if ('description' in r) {
        const localDesc = c.data.description // SlashCommandBuilder always has a string description
        if (r.description !== localDesc) return true
      }

      // dm_permission can be undefined; default to true if unset on either side
      const localDm = (c.data as unknown as { dm_permission?: boolean })
        .dm_permission
      const localDmNorm = typeof localDm === 'boolean' ? localDm : true
      const remoteDm = (r as Partial<APIApplicationCommand>).dm_permission
      const remoteDmNorm = typeof remoteDm === 'boolean' ? remoteDm : true
      if (localDmNorm !== remoteDmNorm) return true
    }
    return false
  }

  let shouldDeploy = true
  try {
    shouldDeploy =
      process.env.FORCE_COMMAND_DEPLOY === '1' || (await hasNonSyncedChanges())
  } catch {
    // if anything goes wrong, deploy to be safe
    shouldDeploy = true
  }

  if (shouldDeploy) {
    try {
      const route = guildId
        ? Routes.applicationGuildCommands(clientId, guildId)
        : Routes.applicationCommands(clientId)

      const res = (await rest.put(route, {
        body: commandsData,
      })) as unknown as Array<APIApplicationCommand>

      console.log(
        `Deployed ${
          Array.isArray(res) ? res.length : commandsData.length
        } command(s) ${guildId ? `to guild ${guildId}` : 'globally'}.`
      )
    } catch (error) {
      console.error('Failed to register commands:', error)
    }
  } else {
    console.log('No commands to register with Discord.')
  }

  // ---- Debug: list what's registered ----
  try {
    const route = guildId
      ? Routes.applicationGuildCommands(clientId, guildId)
      : Routes.applicationCommands(clientId)

    const remote = (await rest.get(
      route
    )) as unknown as Array<APIApplicationCommand>
    const names = remote.map((c) => c.name).join(', ') || '(none)'
    console.log('Remote commands:', names)
  } catch (e) {
    console.warn('Could not fetch remote commands:', e)
  }

  // ---- Load buttons ----
  if (fs.existsSync(buttonsPath)) {
    for (const file of fs.readdirSync(buttonsPath)) {
      if (!isCodeFile(file)) continue
      const mod = (await import(path.join(buttonsPath, file))) as unknown
      if (isButtonModule(mod)) {
        buttons.push({ name: mod.button.name, execute: mod.execute })
        console.log('Registered button:', mod.button.name)
      } else {
        console.warn(
          `[buttons] Skipped "${file}" (missing {button.name, execute})`
        )
      }
    }
  }

  // ---- Load modals ----
  if (fs.existsSync(modalsPath)) {
    for (const file of fs.readdirSync(modalsPath)) {
      if (!isCodeFile(file)) continue
      const mod = (await import(path.join(modalsPath, file))) as unknown
      if (isModalModule(mod)) {
        modals.push({ name: mod.modal.name, execute: mod.execute })
        console.log('Registered modal:', mod.modal.name)
      } else {
        console.warn(
          `[modals] Skipped "${file}" (missing {modal.name, execute})`
        )
      }
    }
  }

  // ---- Load menus ----
  if (fs.existsSync(menusPath)) {
    for (const file of fs.readdirSync(menusPath)) {
      if (!isCodeFile(file)) continue
      const mod = (await import(path.join(menusPath, file))) as unknown
      if (isMenuModule(mod)) {
        menus.push({ name: mod.menu.name, execute: mod.execute })
        console.log('Registered menu:', mod.menu.name)
      } else {
        console.warn(`[menus] Skipped "${file}" (missing {menu.name, execute})`)
      }
    }
  }

  // ---- Interaction routing (with safety) ----
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = commands.find((c) => c.name === interaction.commandName)
        if (cmd) await cmd.execute(client, interaction)
      } else if (interaction.isButton()) {
        const key = interaction.customId.split('_')[0]
        const btn = buttons.find((b) => b.name === key)
        if (btn) await btn.execute(client, interaction)
      } else if (interaction.isModalSubmit()) {
        const key = interaction.customId.split('_')[0]
        const mdl = modals.find((m) => m.name === key)
        if (mdl) await mdl.execute(client, interaction)
      } else if (interaction.isStringSelectMenu()) {
        const selected = interaction.values[0]
        const mnu = menus.find((m) => m.name === selected)
        if (mnu) await mnu.execute(client, interaction)
        else
          console.warn(
            `No menu found for value "${selected}" from customId "${interaction.customId}"`
          )
      }
    } catch (err) {
      console.error('Interaction handler error:', err)
      
      // Send error to error channel
      try {
        const { createErrorEmbed, sendError } = await import('./index')
        await sendError(createErrorEmbed('Interaction Error', err))
      } catch (errorReportErr) {
        console.error('Failed to send error report:', errorReportErr)
      }
      
      // Best-effort: avoid throwing
      if (interaction.isRepliable()) {
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.followUp({
              content: 'There was an error.',
              ephemeral: true,
            })
          } else {
            await interaction.reply({
              content: 'There was an error.',
              ephemeral: true,
            })
          }
        } catch {
          /* ignore */
        }
      }
    }
  })
}

export default commandHandler
