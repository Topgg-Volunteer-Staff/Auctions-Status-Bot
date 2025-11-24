import {
  Client,
  StringSelectMenuInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js'

export const menu = {
  name: 'info_server_review',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  await interaction.update({})

  // update to real server guidelines url when available
  const SERVER_GUIDELINES_URL =
    'https://support.top.gg/hc/en-us/sections/23146848169116-Guidelines'

  const embed = new EmbedBuilder()
    .setColor('#E91E63')
    .setTitle('When will my server be reviewed?')
    .setDescription(
      `**Our average review time is 1 week or more.**\n\nIf your server does not get approved within a few minutes after submitting, it means it failed our automoderator checks. When this happens, the server will be put in the manual queue.\n\nPlease make sure your server follows all of our **[Server Guidelines](${SERVER_GUIDELINES_URL})** for a quick and smooth approval!\n\nNote: you must delete and re-add your server to get it reviewed again if it fails our initial checks.`
    )

  await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral })
}
