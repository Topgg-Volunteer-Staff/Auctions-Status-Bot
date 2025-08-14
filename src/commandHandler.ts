import fs from 'node:fs'
import path from 'node:path'
import { REST } from '@discordjs/rest'
import {
  Client,
  SlashCommandBuilder,
  Routes,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from 'discord.js'

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

const commandHandler = async (client: Client) => {
  // Load commands
  const commandFiles = fs.readdirSync(commandsPath)
  for (const file of commandFiles) {
    const { command, execute } = await import(path.join(commandsPath, file))
    commands.push({ name: command.name, data: command, function: execute })
    console.log('Registered command:', command.name)
  }

  // Register commands with Discord if needed
  const commandsData = commands.map((command) => command.data)
  if (await hasNonSyncedChanges()) {
    try {
      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID || ''),
        {
          body: commandsData,
        }
      )
      console.log('All commands registered with Discord.')
    } catch (error) {
      console.error(error)
    }
  } else {
    console.log('No commands to register with Discord.')
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
        // Reset the select menu selection so users can pick the same option again later
        try {
          const rebuiltMenu = StringSelectMenuBuilder.from(
            interaction.component
          )
          await interaction.message.edit({
            components: [
              new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                rebuiltMenu
              ),
            ],
          })
        } catch (err) {
          console.warn('Failed to reset select menu selection:', err)
        }
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
