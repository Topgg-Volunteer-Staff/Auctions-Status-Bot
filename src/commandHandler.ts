import fs from 'node:fs'
import path from 'node:path'
import { REST } from '@discordjs/rest'
import { Client, SlashCommandBuilder, Routes } from 'discord.js'

const commandsPath = path.join(__dirname, 'commands')
const buttonsPath = path.join(__dirname, 'buttons')
const modalsPath = path.join(__dirname, 'modals')
const menusPath = path.join(__dirname, 'menus')
const rest = new REST({ version: '10' }).setToken(
  process.env.DISCORD_TOKEN || ''
)

const commands: Array<{
  name: string
  data: SlashCommandBuilder
  function: Function
}> = []

const buttons: Array<{
  name: string
  function: Function
}> = []

const modals: Array<{
  name: string
  function: Function
}> = []

const menus: Array<{
  name: string
  function: Function
}> = []

export const commandHandler = async (client: Client) => {
  // (Re)initialize registries if they exist at module scope
  commands.length = 0
  buttons.length = 0
  modals.length = 0
  menus.length = 0

  // --- Load Commands ---
  const commandFiles = fs.readdirSync(commandsPath)
  for (const file of commandFiles) {
    if (!/\.(js|ts|mjs|cjs)$/.test(file)) continue // ignore non-code
    try {
      const mod = await import(path.join(commandsPath, file))
      const data = mod.command
      const run = mod.execute

      if (!data || !run) {
        console.warn(
          `[commands] Skipped "${file}" (missing export { command, execute })`
        )
        continue
      }

      const name = (data as any)?.name ?? data?.getName?.() ?? 'unknown'
      commands.push({ name, data, function: run })
      console.log('Registered command:', name)
    } catch (err) {
      console.error(`[commands] Failed to load "${file}"`, err)
    }
  }

  // --- Register Commands with Discord ---
  const clientId = process.env.DISCORD_CLIENT_ID || ''
  const guildId = process.env.DISCORD_GUILD_ID || '333949691962195969' // set for instant guild deploys

  const toJSON = (x: any) => (typeof x?.toJSON === 'function' ? x.toJSON() : x)
  const commandsData = commands.map((c) => toJSON(c.data))

  let shouldDeploy = true
  try {
    // you already have this helper; if it throws or is missing, default to true
    // @ts-ignore
    if (typeof hasNonSyncedChanges === 'function') {
      // @ts-ignore
      shouldDeploy =
        process.env.FORCE_COMMAND_DEPLOY === '1' ||
        (await hasNonSyncedChanges())
    } else {
      shouldDeploy = true
    }
  } catch {
    shouldDeploy = true
  }

  if (shouldDeploy) {
    try {
      const route = guildId
        ? Routes.applicationGuildCommands(clientId, guildId)
        : Routes.applicationCommands(clientId)

      const res = (await rest.put(route, { body: commandsData })) as any[]
      console.log(
        `Deployed ${
          Array.isArray(res) ? res.length : commandsData.length
        } command(s) ${guildId ? `to guild ${guildId}` : 'globally'}.`
      )
    } catch (error: any) {
      console.error('Failed to register commands:', error?.data ?? error)
    }
  } else {
    console.log('No commands to register with Discord.')
  }

  // --- Debug: list what Discord thinks is registered right now ---
  try {
    const route = guildId
      ? Routes.applicationGuildCommands(clientId, guildId)
      : Routes.applicationCommands(clientId)
    const remote = (await rest.get(route)) as any[]
    console.log(
      'Remote commands:',
      remote.map((c) => `${c.name} (${c.type})`).join(', ') || '(none)'
    )
  } catch (e: any) {
    console.warn('Could not fetch remote commands:', e?.data ?? e)
  }

  // Load buttons
  const buttonFiles = fs.readdirSync(buttonsPath)
  for (const file of buttonFiles) {
    const { button, execute } = await import(path.join(buttonsPath, file))
    buttons.push({ name: button.name, function: execute })
    console.log('Registered button:', button.name)
  }

  // Load modals if folder exists
  if (fs.existsSync(modalsPath)) {
    const modalFiles = fs.readdirSync(modalsPath)
    for (const file of modalFiles) {
      const { modal, execute } = await import(path.join(modalsPath, file))
      modals.push({ name: modal.name, function: execute })
      console.log('Registered modal:', modal.name)
    }
  }

  // Load menus if folder exists
  if (fs.existsSync(menusPath)) {
    const menuFiles = fs.readdirSync(menusPath)
    for (const file of menuFiles) {
      const { menu, execute } = await import(path.join(menusPath, file))
      menus.push({ name: menu.name, function: execute })
      console.log('Registered menu:', menu.name)
    }
  }

  // Interaction handler
  client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
      const cmd = commands.find((c) => c.name === interaction.commandName)
      if (cmd) await cmd.function(client, interaction)
    } else if (interaction.isButton()) {
      const buttonType = interaction.customId.split('_')[0]
      const btn = buttons.find((b) => b.name === buttonType)
      if (btn) await btn.function(client, interaction)
    } else if (interaction.isModalSubmit()) {
      const modalType = interaction.customId.split('_')[0]
      const mdl = modals.find((m) => m.name === modalType)
      if (mdl) await mdl.function(client, interaction)
    } else if (interaction.isStringSelectMenu()) {
      const selectedValue = interaction.values[0]
      const mnu = menus.find((m) => m.name === selectedValue)

      if (mnu) {
        await mnu.function(client, interaction)
      } else {
        console.warn(
          `No menu found for value "${selectedValue}" from customId "${interaction.customId}"`
        )
      }
    }
  })
}

const hasNonSyncedChanges = async (): Promise<boolean> => {
  const remoteCommands = (await rest.get(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID || '')
  )) as Array<SlashCommandBuilder>

  const localCommands = commands.map((command) => command.data)

  if (remoteCommands.length !== localCommands.length) return true

  for (const localCommand of localCommands) {
    if (!remoteCommands.find((remote) => remote.name === localCommand.name))
      return true
  }

  for (const remoteCommand of remoteCommands) {
    if (!localCommands.find((local) => local.name === remoteCommand.name))
      return true
  }

  for (const localCommand of localCommands) {
    const remoteCommand = remoteCommands.find(
      (r) => r.name === localCommand.name
    )
    if (
      !remoteCommand ||
      remoteCommand.name !== localCommand.name ||
      remoteCommand.description !== localCommand.description ||
      remoteCommand.dm_permission !== localCommand.dm_permission
    ) {
      return true
    }
  }

  return false
}

export default commandHandler
