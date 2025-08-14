import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuInteraction,
  Client,
} from 'discord.js'

export const menu = {
  name: 'dispute_decline',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const modal = new ModalBuilder()
    .setCustomId('disputeDecline') // modal custom id
    .setTitle('Dispute a bot decline')

  const reasonInput = new TextInputBuilder()
    .setCustomId('disputeID')
    .setLabel('ID 𝗈f 𝗍he 𝖻ot 𝗍hat 𝗐as 𝖽eclined')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. 264811613708746752')

  const reason = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Why 𝗐as 𝗍his 𝖽ecline 𝗐rong?')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000)
    .setPlaceholder('E.g. the review was incorrect because...')

  const reasonInputRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reasonInput
  )

  const reasonRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
    reason
  )

  modal.addComponents(reasonInputRow, reasonRow)
  await interaction.showModal(modal)
}
