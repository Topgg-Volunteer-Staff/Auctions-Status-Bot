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
  fs.readdirSync(commandsPath).forEach((file) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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

  // Deal with incoming buttons data
  const buttonsPath = path.join(__dirname, 'buttons')

  const buttons: Array<{
    name: string
    function: Function
  }> = []

  fs.readdirSync(buttonsPath).forEach((file) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { button, execute } = require(path.join(buttonsPath, file))

    buttons.push({ name: button.name, function: execute })

    console.log('Registered button:', button.name)
  })

  client.on('interactionCreate', async (interaction) => {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction
      commands.map((command) => {
        if (command.name === commandName) {
          command.function(client, interaction)
        }
      })
    }

    // Buttons
    if (interaction.isButton()) {
      const buttonType = interaction.customId.substring(
        0,
        interaction.customId.indexOf('_')
      )
      if (buttonType) {
        buttons.map((button) => {
          if (button.name === buttonType) {
            button.function(client, interaction)
          }
        })
      }
    }
  })
}

const hasNonSyncedChanges = async (): Promise<boolean> => {
  const remoteCommands = (await rest.get(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID || '')
  )) as Array<SlashCommandBuilder>
  const localCommands = commands.map((command) => command.data)

  // If the number of commands is different, we need to sync
  if (remoteCommands.length !== localCommands.length) return true

  // If any of the local commands are missing, we need to sync
  for (const localCommand of localCommands) {
    if (
      !remoteCommands.find(
        (remoteCommand) => remoteCommand.name === localCommand.name
      )
    ) {
      return true
    }
  }

  // Check if any of the remote commands are missing locally (deleted commands)
  for (const remoteCommand of remoteCommands) {
    if (
      !localCommands.find(
        (localCommand) => localCommand.name === remoteCommand.name
      )
    ) {
      return true
    }
  }

  // check if command properties are different
  for (const localCommand of localCommands) {
    const remoteCommand = remoteCommands.find(
      (remoteCommand) => remoteCommand.name === localCommand.name
    )

    if (!remoteCommand) return true

    if (
      remoteCommand.name !== localCommand.name ||
      remoteCommand.description !== localCommand.description ||
      remoteCommand.dm_permission !== localCommand.dm_permission
    ) {
      return true
    }

    // TODO: Check if options are different
  }

  return false
}

export default commandHandler
