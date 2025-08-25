import { Client, StringSelectMenuInteraction, EmbedBuilder, MessageFlags } from 'discord.js'

export const menu = {
  name: 'info_bot_review',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  await interaction.update({})

  const embed = new EmbedBuilder()
    .setColor('#E91E63')
    .setTitle('When will my bot be reviewed?')
    .setDescription(
      "**Our current average review time is 1-2 weeks.**\n\nSome bots may take longer to review than others depending on their features. Because of this, we can't guarantee your bot will be reviewed as quickly as someone else's, and there's no exact timeframe for approval. There's also no way to check your position in the queue — but remember, you're not first or last!\n\nYou're free to edit your bot's page anytime, both before and after review. This won't affect your place in the queue.\n\nYou can read more about our review process here: [How the Reviewing Process Works.](https://support.top.gg/support/solutions/articles/73000502501-how-the-bot-reviewal-process-works)\n\n<:topgg_ico_bulb:1026877525261033563> In the meantime, please make sure your bot follows all of our [Bot Guidelines](https://support.top.gg/support/solutions/articles/73000502502-bot-guidelines) for a quick and smooth approval!"
    )

  await interaction.followUp({ embeds: [embed],  flags: MessageFlags.Ephemeral })
}
