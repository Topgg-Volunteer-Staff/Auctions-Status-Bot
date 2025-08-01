import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  Client,
} from 'discord.js'

export const button = {
  name: 'auctionsTicket',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('auctionsModal') // must match modal handler name
    .setTitle('Auctions Support Ticket')

  const issueInput = new TextInputBuilder()
    .setCustomId('issueDescription')
    .setLabel('What do you need help with auctions?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('Describe your issue or question here...')

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(issueInput)
  modal.addComponents(row)

  await interaction.showModal(modal)
}
