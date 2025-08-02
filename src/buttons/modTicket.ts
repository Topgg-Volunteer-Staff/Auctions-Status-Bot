import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  Client,
} from 'discord.js'

export const button = {
  name: 'modTicket',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('modModal') // modal custom id
    .setTitle('Moderator Support Ticket')

  const reasonInput = new TextInputBuilder()
    .setCustomId('modReason')
    .setLabel('What is the reasonfor your ticket?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. reporting a user, ownership help, etc.')

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )
  modal.addComponents(row)

  await interaction.showModal(modal)
}
