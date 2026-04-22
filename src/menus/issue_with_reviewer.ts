import { Client, MessageFlags, StringSelectMenuInteraction } from 'discord.js'

export const menu = {
  name: 'issue_with_reviewer',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
): Promise<void> => {
  await interaction.reply({
    content:
      'Do you have an issue with a reviewer? If so, please email support@top.gg',
    flags: MessageFlags.Ephemeral,
  })
}