import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  Client,
} from 'discord.js'

export const button = {
  name: 'requestownershiptransfer',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('modModal_requestownershiptransfer') // modal custom id
    .setTitle('Request an ownership transfer')

  const reasonInput = new TextInputBuilder()
    .setCustomId('modReason')
    .setLabel('Bot/Server ID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('1376991905191039006')


  const reasonInputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )

  modal.addComponents(reasonInputRow)

  await interaction.showModal(modal)
}
