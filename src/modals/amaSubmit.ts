import {
  ModalSubmitInteraction,
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  TextChannel,
  MessageFlags,
} from 'discord.js'
import { channelIds } from '../globals'

const AMA_CHANNEL_ID = channelIds.amaChannel

export const modal = {
  name: 'amaSubmit',
}

export const execute = async (
  _client: Client,
  interaction: ModalSubmitInteraction
) => {
  const question = interaction.fields.getTextInputValue('amaQuestion')

  const embed = new EmbedBuilder()
    .setTitle('AMA Question')
    .setDescription(question)
    .addFields({ name: 'Submitted by', value: `<@${interaction.user.id}>` })
    .setColor('#ff0000') // red for pending

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('amaAccept')
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('amaDecline')
      .setLabel('Decline')
      .setStyle(ButtonStyle.Danger)
  )

  const channel = (await interaction.client.channels.fetch(
    AMA_CHANNEL_ID
  )) as TextChannel
  await channel.send({ embeds: [embed], components: [row] })

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('✅ Question Submitted')
        .setDescription(
          'Your question has been submitted for review! Thanks for taking part of the Staff AMA. Feel free to submit other questions that you think of.'
        )
        .setColor('#00ff00'),
    ],
    flags: MessageFlags.Ephemeral,
  })
}
