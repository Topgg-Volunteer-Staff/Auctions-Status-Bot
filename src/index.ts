import { Client, Partials, GatewayIntentBits, EmbedBuilder, TextChannel  } from 'discord.js';
import startReminders from './utils/status/startReminders';
import commandHandler from './commandHandler';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.GuildScheduledEvent,
    Partials.Message,
    Partials.Reaction,
    Partials.ThreadMember,
    Partials.User,
  ],
});

client.on('ready', async () => {
  console.log(`Logged in as ${client.user?.tag}!`);
  client.user?.setPresence({
    status: 'online',
    activities: [{ name: 'the clock!', type: 3 }],
  });
  startReminders(client);
});

commandHandler(client);

function createErrorEmbed(title: string, errorData: unknown) {
  const errorText =
    errorData instanceof Error
      ? errorData.stack || errorData.message
      : typeof errorData === 'string'
      ? errorData
      : JSON.stringify(errorData, null, 2);

  return new EmbedBuilder()
    .setAuthor({
      name: 'Top.gg Bot',
      iconURL:
        'https://i.imgur.com/W2d2UY7.jpeg',
    })
    .setTitle(title)
    .setDescription(`An error occurred within the Top.gg Bot\n\`\`\`\n${errorText}\n\`\`\``)
    .setTimestamp()
    .setColor('#FF0000');
}

async function sendErrorToChannel(embed: EmbedBuilder) {
  const channelId = '1403884779408986243';
  const channel = client.channels.cache.get(channelId);

  if (channel?.isTextBased()) {
    try {
      await (channel as TextChannel).send({ embeds: [embed] });
      console.log('Error message sent successfully');
    } catch (sendErr) {
      console.error('Error sending message:', sendErr);
    }
  } else {
    console.error(`Channel with ID ${channelId} not found or is not text-based`);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', async (err) => {
  console.error('Caught exception:', err);
  await sendErrorToChannel(createErrorEmbed('uncaughtException', err));
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason) => {
  console.error('Unhandled rejection:', reason);
  await sendErrorToChannel(createErrorEmbed('unhandledRejection', reason));
});

// Handle client error events
client.on('error', async (err) => {
  console.error('Client error:', err);
  await sendErrorToChannel(createErrorEmbed('ClientError', err));
});

client.login(process.env.DISCORD_TOKEN);
