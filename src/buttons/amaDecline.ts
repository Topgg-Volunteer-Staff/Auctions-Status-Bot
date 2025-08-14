import { ButtonInteraction, Client } from 'discord.js';

export const button = {
  name: 'amaDecline',
};

export const execute = async (_client: Client, interaction: ButtonInteraction) => {
  await interaction.message.delete();
  await interaction.reply({ content: '❌ Question declined and deleted.', ephemeral: true });
}