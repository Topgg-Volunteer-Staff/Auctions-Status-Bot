import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonInteraction,
  Client,
} from 'discord.js'

export const button = {
  name: 'otherreport',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('modModal_otherreport') // modal custom id
    .setTitle('I need help with something else')

  const reasonInput = new TextInputBuilder()
    .setCustomId('modReason')
    .setLabel('𝖶𝗁𝖺𝗍 𝖽𝗈 𝗒𝗈𝗎 𝗇𝖾𝖾𝖽 𝗁𝖾𝗅𝗉 𝗐𝗂𝗍𝗁?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)

  const reasonInputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )

  modal.addComponents(reasonInputRow)
  await interaction.showModal(modal)
}
