import { Client, StringSelectMenuInteraction, EmbedBuilder } from 'discord.js'

export const menu = {
  name: 'server_reviewtime_info',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const embed = new EmbedBuilder()
    .setColor('#E91E63')
    .setTitle('When will my server be reviewed?')
    .setDescription(
      '**There is no set review time for servers.**\n\nIf your server does not get approved within a few minutes after submitting, it means it failed our automoderator checks.\n\nPlease make sure your server follows all of our [Server Guidelines](https://support.top.gg/support/solutions/articles/73000502503-server-guidelines) for a quick and smooth approval!\n\nNote: you must delete and re-add your server to get it reviewed again if it fails our initial checks.'
    )

  await interaction.reply({ embeds: [embed], ephemeral: true })
}
