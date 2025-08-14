import { Client, StringSelectMenuInteraction } from 'discord.js'

export const menu = {
  name: 'reset',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return
  try {
    await interaction.deferUpdate()
  } catch {}
}
