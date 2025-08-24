import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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

  const createButton = new ButtonBuilder()
    .setCustomId('disputeCreate')
    .setLabel('Create ticket')
    .setStyle(ButtonStyle.Primary)

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(createButton)

  await interaction.reply({
    content:
      'This ticket is to discuss the reasons your bot was rejected. If you still want to talk about your decline, click the button below.\n\nFor any other questions, please use the <#714045415707770900> channel!',
    components: [row],
    ephemeral: true,
  })
}
