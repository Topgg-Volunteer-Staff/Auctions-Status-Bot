import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  CommandInteraction,
  TextChannel,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags,
} from 'discord.js'

export const command = {
  name: 'ama-panel',
  description: 'Post the AMA question panel',
}

export const execute = async (
  _client: Client,
  interaction: CommandInteraction
) => {
  if (
    !interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)
  )
    return

  const channel = interaction.channel
  if (!channel || !(channel instanceof TextChannel)) return

  const panelEmbed = new EmbedBuilder()
    .setTitle('📢 Staff Ask Me Anything Event')
    .setDescription(
      'Click the button below to submit a question for the AMA!\n\n' +
        'Please only ask questions about Top.gg, its features, or things you would like to see on the site.'
    )
    .setColor('#ff3366')

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('amaAsk')
      .setLabel('Ask a Question')
      .setStyle(ButtonStyle.Primary)
  )

  await channel.send({ embeds: [panelEmbed], components: [row] })
  await interaction.reply({
    content: '✅ AMA panel posted!',
    flags: MessageFlags.Ephemeral,
  })
}
