import {
  Client,
  EmbedBuilder,
  SlashCommandBuilder,
  TextChannel,
  ChannelType,
  ChatInputCommandInteraction,
} from 'discord.js'

export const command = new SlashCommandBuilder()
  .setName('fakedecline')
  .setDescription('Send a fake decline embed')
  .addStringOption(option =>
    option
      .setName('botname')
      .setDescription('Name of the bot')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('botid')
      .setDescription('ID of the bot')
      .setRequired(true)
  )
  .addUserOption(option =>
    option
      .setName('reviewer')
      .setDescription('Reviewer who declined the bot')
      .setRequired(true)
  )
  .addUserOption(option =>
    option
      .setName('pinguser')
      .setDescription('User to ping in the message')
      .setRequired(true)
  )

export const execute = async (
  client: Client,
  interaction: ChatInputCommandInteraction
) => {
  // Extract options
  const botName = interaction.options.getString('botname', true)
  const botId = interaction.options.getString('botid', true)
  const reviewer = interaction.options.getUser('reviewer', true)
  const pingUser = interaction.options.getUser('pinguser', true)

  // Build the embed with decline info
  const declineEmbed = new EmbedBuilder()
    .setTitle('Bot Declined')
    .setColor('#ED4245') // red-ish color
    .addFields(
      { name: 'Bot', value: `${botName} (${botId})`, inline: true },
      { name: 'Reviewer', value: `<@${reviewer.id}> ([top.gg profile](https://top.gg/user/266278924563456000))`, inline: true },
      {
        name: 'Reason',
        value:
          'Your bot was offline when we tried to review it. For that reason, we are unable to test it. Please get your bot online and re-apply.',
      }
    )
    .setTimestamp()

  // Target channel
  const targetChannelId = '1405010949152444500'
  const targetChannel = client.channels.cache.get(targetChannelId)

  if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
    return interaction.reply({
      content: 'Target channel not found or invalid.',
      ephemeral: true,
    })
  }

  // Send the message with ping + embed
  await (targetChannel as TextChannel).send({
    content: `<@${pingUser.id}>`,
    embeds: [declineEmbed],
  })

  // IMPORTANT: Add return here to fix "not all code paths return a value" error
  return interaction.reply({
    content: `Fake decline embed sent to <#${targetChannelId}> pinging <@${pingUser.id}>.`,
    ephemeral: true,
  })
}

