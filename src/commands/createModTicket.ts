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
        ':warning: __**This is not the place to discuss decline decisions. Please DM the Reviewer directly.__**',
      ].join('\n')
    )

  const channel = interaction.channel as TextChannel
  await channel.send({
    embeds: [embed],
    components: [buttonsRow1, buttonsRow2], // two rows now
  })

  await interaction.reply({
    content: 'Moderator ticket message sent.',
    ephemeral: true,
  })
}
