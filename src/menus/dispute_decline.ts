import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuInteraction,
  Client,
  EmbedBuilder,
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
      '**__This ticket is strictly for discussing bot rejections.__**\n\nIf you are disputing your bot’s decline, click the button below. For all other questions, please use the <#714045415707770900> channel!\n\n:x: Tickets opened for any other reason will be closed without explanation.'
    )

  await interaction.followUp({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  })
}
