import fs from 'node:fs'
import path from 'node:path'
import { REST } from '@discordjs/rest'
import { Client, SlashCommandBuilder, Routes } from 'discord.js'

const commandsPath = path.join(__dirname, 'commands')
const rest = new REST({ version: '10' }).setToken(
  process.env.DISCORD_TOKEN || ''
)

const commands: Array<{
  name: string
  data: SlashCommandBuilder
  function: Function
}> = []

const commandHandler = async (client: Client) => {
  // Load commands
  fs.readdirSync(commandsPath).forEach((file) => {
    const { command, execute } = require(path.join(commandsPath, file))
    commands.push({ name: command.name, data: command, function: execute })
    console.log('Registered command:', command.name)
  })

  const commandsData = commands.map((command) => command.data)

  if (await hasNonSyncedChanges()) {
    rest
      .put(Routes.applicationCommands(process.env.DISCORD_CLIENT_ID || ''), {
        body: commandsData,
      })
      .then(() => {
        console.log('All commands registered with Discord.')
      })
      .catch(console.error)
  } else {
    console.log('No commands to register with Discord.')
  }

  // Load buttons
  const buttonsPath = path.join(__dirname, 'buttons')
  const buttons: Array<{
    name: string
    function: Function
  }> = []

  fs.readdirSync(buttonsPath).forEach((file) => {
    const { button, execute } = require(path.join(buttonsPath, file))
    buttons.push({ name: button.name, function: execute })
    console.log('Registered button:', button.name)
  })

  // Load modals
  const modalsPath = path.join(__dirname, 'modals')
  const modals: Array<{
    name: string
    function: Function
  }> = []

  if (fs.existsSync(modalsPath)) {
    fs.readdirSync(modalsPath).forEach((file) => {
      const { modal, execute } = require(path.join(modalsPath, file))
      modals.push({ name: modal.name, function: execute })
      console.log('Registered modal:', modal.name)
    })
  }

  // Handle interactions
  client.on('interactionCreate', async (interaction) => {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction
      const cmd = commands.find((c) => c.name === commandName)
      if (cmd) cmd.function(client, interaction)
    }

    // Buttons
    if (interaction.isButton()) {
      const buttonType = interaction.customId.split('_')[0]
      const btn = buttons.find((b) => b.name === buttonType)
      if (btn) btn.function(client, interaction)
    }

    // Modals
    if (interaction.isModalSubmit()) {
      const modalType = interaction.customId.split('_')[0]
      const mdl = modals.find((m) => m.name === modalType)
      if (mdl) mdl.function(client, interaction)
    }
  })
}

// Existing sync checker
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
