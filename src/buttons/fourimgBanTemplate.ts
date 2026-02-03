import { ButtonInteraction, Client, MessageFlags } from 'discord.js'

export const button = {
  name: 'fourimgBanTemplate',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  const [, userId] = interaction.customId.split('_')

  if (!userId) {
    await interaction.reply({
      content: 'Missing user id for ban template.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.reply({
    content: `.b ${userId} compromised or hacked account`,
    flags: MessageFlags.Ephemeral,
  })
}
