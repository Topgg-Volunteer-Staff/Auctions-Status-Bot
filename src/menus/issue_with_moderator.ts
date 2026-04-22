import { Client, MessageFlags, StringSelectMenuInteraction } from 'discord.js'

export const menu = {
  name: 'issue_with_moderator',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
): Promise<void> => {
  await interaction.reply({
    content:
      'Do you have an issue with a moderator? If so, please email support@top.gg',
    flags: MessageFlags.Ephemeral,
  })
}