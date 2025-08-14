import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
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
  // Moderator select menu
  const modSelectMenu = new StringSelectMenuBuilder()
    .setCustomId('mod_ticket_select')
    .setPlaceholder('Select a reason to contact a moderator')
    .addOptions([
      {
        label: 'Click to reset',
        value: 'reset',
      },
      {
        label: 'Report a user',
        value: 'reportuser_user',
      },
      {
        label: 'Report a bot',
        value: 'reportbot_bot',
      },
      {
        label: 'Report a server',
        value: 'reportserver_server',
      },
      {
        label: 'Report a review',
        value: 'reportreview_review',
      },
      {
        label: 'Request ownership transfer',
        value: 'requestownershiptransfer_transfer',
      },
      {
        label: 'Other',
        value: 'otherreport_report',
      },
    ])

  // Reviewer select menu
  const reviewerSelectMenu = new StringSelectMenuBuilder()
    .setCustomId('reviewer_ticket_select')
    .setPlaceholder('Click me to dispute your bot')
    .addOptions([
      {
        label: 'Click to reset',
        value: 'reset',
      },
      {
        label: 'Dispute a decline',
        value: 'dispute_decline',
      },
    ])

  const embed = new EmbedBuilder()
    .setTitle(`${emoji.sunglasses} Contact a moderator`)
    .setColor('#E91E63')
    .setDescription(
      `Need help or want to report something? Use the menu below to open a private ticket with our <@&${roleIds.moderator}> team.`
    )

  const embedReview = new EmbedBuilder()
    .setTitle(`${emoji.sunglasses} Contact a reviewer`)
    .setDescription(
      `Want to appeal a bot decline? Use the menu below to open a private ticket with our <@&${roleIds.reviewer}> team.`
    )
    .setColor('#E91E63')

  const channel = interaction.channel as TextChannel
  await channel.send({
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        modSelectMenu
      ),
    ],
  })

  await channel.send({
    embeds: [embedReview],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        reviewerSelectMenu
      ),
    ],
  })

  await interaction.reply({
    content: 'Moderator ticket message sent.',
    ephemeral: true,
  })
}
