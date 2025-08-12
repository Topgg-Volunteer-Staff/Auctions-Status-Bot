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
      .setLabel('🤔 Dispute a decline')
      .setStyle(ButtonStyle.Success)
      .setCustomId('dispute_decline'),
  )

  const buttonsRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('🐾 Report a user')
      .setStyle(ButtonStyle.Danger)
      .setCustomId('reportuser_user'),

    new ButtonBuilder()
      .setLabel('🤖 Report a bot')
      .setStyle(ButtonStyle.Danger)
      .setCustomId('reportbot_bot'),

    new ButtonBuilder()
      .setLabel('🤖 Report a server')
      .setStyle(ButtonStyle.Danger)
      .setCustomId('reportserver_server')
  )

  const buttonsRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('📝 Report a review')
      .setStyle(ButtonStyle.Danger)
      .setCustomId('reportreview_review'),

    new ButtonBuilder()
      .setLabel('🔑 Request ownership transfer')
      .setStyle(ButtonStyle.Primary)
      .setCustomId('requestownershiptransfer_transfer'),

    new ButtonBuilder()
      .setLabel('❓ Other')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId('otherreport_report')
  )

  const embed = new EmbedBuilder()
    .setTitle(`${emoji.sunglasses} Contact a Top.gg Moderator`)
    .setColor('#E91E63') // nice pink/red color
    .setDescription(
      [
        `Need help or want to report something? Use the buttons below to open a private ticket with our <@&${roleIds.moderator}> team.`,
        '',
        ':warning: **This is __NOT__ the place to discuss decline decisions. Please DM the Reviewer directly.**',
      ].join('\n')
    )

  const embedReview = new EmbedBuilder()
    .setTitle(`Contact a reviewer`)
     .setDescription(
        `If you feel your decline was wong, please open a ticket below.`,
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
