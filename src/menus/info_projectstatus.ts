import { Client, StringSelectMenuInteraction, EmbedBuilder } from 'discord.js'

export const menu = {
  name: 'info_projectstatus',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  await interaction.update({})

  const embed = new EmbedBuilder()
    .setColor('#E91E63')
    .setTitle("How do I check my bot's/server's position in the queue?")
    .setDescription(
      '**There is no way to check your project\'s position in the queue right now.**\n\nThis is planned for the future and there is no ETA for when it will be implemented.\n\nIf you just want to verify that your project was submitted, you can check your project\'s page and see "Your project is currently in review" in a red banner.'
    )

  await interaction.followUp({ embeds: [embed], ephemeral: true })
}
