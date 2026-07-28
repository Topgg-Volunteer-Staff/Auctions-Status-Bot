import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ModalSubmitInteraction,
  TextChannel,
} from 'discord.js'
import { channelIds } from '../globals'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  COMPONENTS_V2_FLAGS,
  createTextPanel,
} from '../utils/componentsV2'

const AMA_CHANNEL_ID = channelIds.amaChannel

export const modal = {
  name: 'amaSubmit',
}

export const execute = async (
  _client: Client,
  interaction: ModalSubmitInteraction
) => {
  const question = interaction.fields.getTextInputValue('amaQuestion')

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

  const panel = createTextPanel({
    accentColor: 0xff0000,
    title: 'AMA Question',
    description: `${question}\n\n**Submitted by**\n<@${interaction.user.id}>`,
  }).addActionRowComponents(row)

  const channel = (await interaction.client.channels.fetch(
    AMA_CHANNEL_ID
  )) as TextChannel

  await channel.send({
    components: [panel],
    flags: COMPONENTS_V2_FLAGS,
    allowedMentions: { parse: [] },
  })

  await interaction.reply({
    components: [
      createTextPanel({
        accentColor: 0x00ff00,
        title: '✅ Question Submitted',
        description:
          'Your question has been submitted for review! Thanks for taking part of the Staff AMA. Feel free to submit other questions that you think of.',
      }),
    ],
    flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
  })
}
