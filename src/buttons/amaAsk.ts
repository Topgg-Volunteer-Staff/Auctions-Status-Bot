import {
  ButtonInteraction,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Client,
} from 'discord.js';

export const button = {
  name: 'amaAsk',
};

export const execute = async (_client: Client, interaction: ButtonInteraction) => {
  const modal = new ModalBuilder()
    .setCustomId('amaSubmit')
    .setTitle('Submit your AMA question');

  const questionInput = new TextInputBuilder()
    .setCustomId('amaQuestion')
    .setLabel('What is your question?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(questionInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
};