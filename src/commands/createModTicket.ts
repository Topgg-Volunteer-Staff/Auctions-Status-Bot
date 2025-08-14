import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  CommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  SlashCommandBuilder,
  TextChannel,
} from 'discord.js'
import { roleIds } from '../globals'
import { emoji } from '../utils/emojis'

export const command = new SlashCommandBuilder()
  .setName('createmodticket')
  .setDescription('Post the create mod ticket message')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions('0')

export const execute = async (
  _client: Client,
  interaction: CommandInteraction
) => {
  const buttonsRow0 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Dispute a decline')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId('dispute_decline')
  )

  const buttonsRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Report a user')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId('reportuser_user'),

    new ButtonBuilder()
      .setLabel('Report a bot')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId('reportbot_bot'),

    new ButtonBuilder()
      .setLabel('Report a server')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId('reportserver_server')
  )

  const buttonsRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Report a review')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId('reportreview_review'),

    new ButtonBuilder()
      .setLabel('Request ownership transfer')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId('requestownershiptransfer_transfer'),

    new ButtonBuilder()
      .setLabel('Other')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId('otherreport_report')
  )

  const embed = new EmbedBuilder()
    .setTitle(`${emoji.sunglasses} Contact a moderator`)
    .setColor('#E91E63') // nice pink/red color
    .setDescription(
      `Need help or want to report something? Use the buttons below to open a private ticket with our <@&${roleIds.moderator}> team.`
    )

  const embedReview = new EmbedBuilder()
    .setTitle(`${emoji.sunglasses} Contact a reviewer`)
    .setDescription(
      `Want to appeal a bot decline? Use the button below to open a private ticket with our ${roleIds.reviewer} team.`
    )
    .setColor('#E91E63') // nice pink/red color

  const channel = interaction.channel as TextChannel
  await channel.send({
    embeds: [embed],
    components: [buttonsRow1, buttonsRow2], // two rows now
  })

  await channel.send({
    embeds: [embedReview],
    components: [buttonsRow0], // two rows now
  })

  await interaction.reply({
    content: 'Moderator ticket message sent.',
    ephemeral: true,
  })
}
