import { Client, Partials, GatewayIntentBits } from 'discord.js'
import startReminders from './utils/status/startReminders'
import commandHandler from './commandHandler'
// Configure client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  // Enabling all partials
  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.GuildScheduledEvent,
    Partials.Message,
    Partials.Reaction,
    Partials.ThreadMember,
    Partials.User,
  ],
})

// Start bot
client.on('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}!`)
  client.user?.setPresence({
    status: 'online',
    activities: [
      {
        name: 'the clock!',
        type: 3,
      },
    ],
  })
  startReminders(client)
})

// Register commands
commandHandler(client)

client.login(process.env.DISCORD_TOKEN)
