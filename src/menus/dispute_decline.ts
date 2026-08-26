import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuInteraction,
  Client,
} from 'discord.js'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  createTextPanel,
} from '../utils/componentsV2'
import { createCustomAlertContainer } from '../utils/customAlert'

export const menu = {
  name: 'dispute_decline',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return
  await interaction.update({})

  const createButton = new ButtonBuilder()
    .setCustomId('disputeCreate')
    .setLabel('Create ticket')
    .setStyle(ButtonStyle.Primary)

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(createButton)

  const panel = createTextPanel({
    accentColor: 0xe91e63,
    title: 'Why was my project declined?',
    description:
      '**__This ticket is strictly for discussing project rejections.__**\n\nIf you are disputing your projects decline, click the button below. For all other questions, please use the <#714045415707770900> channel!\n\n:x: Tickets opened for any other reason will be closed without explanation.',
  }).addActionRowComponents(row)

  const alertContainer = createCustomAlertContainer()

  await interaction.followUp({
    components: alertContainer ? [alertContainer, panel] : [panel],
    flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
  })
}
