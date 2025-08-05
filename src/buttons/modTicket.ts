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
    .setLabel('How can we help you?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. reporting a user, ownership help, etc.')

  const entityID = new TextInputBuilder()
    .setCustomId('entityID')
    .setLabel('User/Bot/Server ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. 264811613708746752 or N/A')

  const reasonInputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )
  const entityIDRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    entityID
  )

  modal.addComponents(reasonInputRow, entityIDRow)

  await interaction.showModal(modal)
}
