import { Client, StringSelectMenuInteraction, MessageFlags } from 'discord.js'

export const menu = {
  name: 'reset',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return
  try {
    await interaction.reply({
      content: 'Reset your selection!',
       flags: MessageFlags.Ephemeral
    })
  } catch (err) {
    console.warn('reset menu: failed to send ephemeral reply', err)
  }
}
