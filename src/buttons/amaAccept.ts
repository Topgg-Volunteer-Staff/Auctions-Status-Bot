import { ButtonInteraction, Client, EmbedBuilder, MessageFlags } from 'discord.js'

export const button = {
  name: 'amaAccept',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  const message = interaction.message
  const oldEmbed = message.embeds[0]

  if (!oldEmbed) {
    await interaction.reply({ content: 'Embed not found.', flags: MessageFlags.Ephemeral})
    return
  }

  const newEmbed = EmbedBuilder.from(oldEmbed)
    .setColor('#00ff00')
    .addFields({ name: 'Approved by', value: `<@${interaction.user.id}>` })

  await message.edit({ embeds: [newEmbed], components: [] })
  await interaction.reply({ content: '✅ Question approved!', flags: MessageFlags.Ephemeral })
}
