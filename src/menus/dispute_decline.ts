import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuInteraction,
  Client,
  EmbedBuilder,
  MessageFlags
} from 'discord.js'

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

  const embed = new EmbedBuilder()
    .setColor('#E91E63')
    .setTitle('Why was my bot declined?')
    .setDescription(
      'This ticket is to discuss the reasons your bot was rejected. If you still want to talk about your decline, click the button below.\n\nFor any other questions, please use the <#714045415707770900> channel!'
    )

  await interaction.followUp({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral
  })
}
