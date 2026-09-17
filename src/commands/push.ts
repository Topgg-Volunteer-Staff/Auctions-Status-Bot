import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  ContainerBuilder,
  InteractionContextType,
  SectionBuilder,
  SlashCommandBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js'

import { roleIds } from '../globals'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
} from '../utils/componentsV2'
import { sendErrorLog } from '../utils/errorLogging'
import { fetchTopggEntityModPanelInfo } from '../utils/topggTeams'

const SNOWFLAKE_PATTERN = /^\d{17,19}$/

export const command = new SlashCommandBuilder()
  .setName('push')
  .setDescription('Notify a user that their server or bot has been transferred')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName('server-complete')
      .setDescription('Notify a user their server has been transferred')
      .addStringOption((option) =>
        option
          .setName('external-server-id')
          .setDescription('The Discord server ID')
          .setRequired(true)
      )
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('The user to notify')
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('bot-complete')
      .setDescription('Notify a user their bot has been transferred')
      .addStringOption((option) =>
        option
          .setName('external-bot-id')
          .setDescription('The Discord bot ID')
          .setRequired(true)
      )
      .addUserOption((option) =>
        option
          .setName('user')
          .setDescription('The user to notify')
          .setRequired(true)
      )
  )

const hasPushAccess = (interaction: ChatInputCommandInteraction): boolean => {
  if (!interaction.inCachedGuild()) return false

  return [roleIds.supportTeam, roleIds.moderator].some((roleId) =>
    interaction.member.roles.cache.has(roleId)
  )
}

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  if (!hasPushAccess(interaction)) {
    await interaction.reply({
      components: [createErrorPanel('You do not have permission to use this command!')],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const sub = interaction.options.getSubcommand()
  const targetUser = interaction.options.getUser('user', true)

  const entityLabel = sub === 'server-complete' ? 'server' : 'bot'

  const id =
    sub === 'server-complete'
      ? interaction.options.getString('external-server-id', true).trim()
      : interaction.options.getString('external-bot-id', true).trim()

  if (!SNOWFLAKE_PATTERN.test(id)) {
    await interaction.reply({
      components: [createErrorPanel(`Invalid ${entityLabel} ID format!`)],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  await interaction.deferReply()

  // Server dashboard/public links use Top.gg's internal ID, so the
  // external Discord ID needs to be resolved to internal first. Bot links
  // use the external Discord ID directly.
  let linkId = id
  let reviewStatus: string | null

  try {
    const modPanelInfo = await fetchTopggEntityModPanelInfo(
      id,
      sub === 'server-complete' ? 'SERVER' : 'BOT'
    )

    if (!modPanelInfo) {
      await interaction.editReply({
        components: [
          createErrorPanel(
            `${entityLabel === 'server' ? 'Server' : 'Bot'} not found on Top.gg`,
            `No listing found for ${entityLabel} ID \`${id}\`.`
          ),
        ],
        flags: COMPONENTS_V2_FLAGS,
      })
      return
    }

    if (sub === 'server-complete') {
      linkId = modPanelInfo.internalId
    }
    reviewStatus = modPanelInfo.reviewStatus
  } catch (error) {
    await sendErrorLog(interaction.client, 'push.modPanelLookup.failed', error, {
      id,
      type: sub,
    })

    await interaction.editReply({
      components: [
        createErrorPanel(
          'Lookup failed',
          `Failed to look up this ${entityLabel} on Top.gg. Please try again later.`
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const dashboardUrl =
    sub === 'server-complete'
      ? `https://top.gg/discord/servers/${linkId}/dashboard`
      : `https://top.gg/discord/bots/${linkId}/dashboard`

  const publicUrl =
    sub === 'server-complete'
      ? `https://top.gg/discord/servers/${linkId}`
      : `https://top.gg/bot/${linkId}`

  let iconUrl: string | null = null
  try {
    if (sub === 'server-complete') {
      const guild = await interaction.client.guilds.fetch(id)
      iconUrl = guild.iconURL({ size: 256 })
    } else {
      const bot = await interaction.client.users.fetch(id)
      iconUrl = bot.displayAvatarURL({ size: 256 })
    }
  } catch {
    iconUrl = null
  }

  const messageText = new TextDisplayBuilder().setContent(
    `<:DoggSunglasses:1400113207527477379> **Transfer Complete**\n\n` +
      `<@${targetUser.id}>\n\n` +
      `Your ${entityLabel} has been transferred over! Here are the links and controls to your ${entityLabel}.\n\n` +
      `**Edit:** [Dashboard](${dashboardUrl})\n` +
      `**Public Page:** [View Listing](${publicUrl}) (only if your ${entityLabel} is live)\n\n` +
      'Let me know if you have any other questions! <:DoggThumbsUp:1400113319905329264>\n\n' +
      `-# Review Status: ${reviewStatus ?? 'None'}`
  )

  const panel = new ContainerBuilder()
    .setAccentColor(0x00cc88)
    .addSectionComponents(
      iconUrl
        ? [
            new SectionBuilder()
              .addTextDisplayComponents(messageText)
              .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl)),
          ]
        : []
    )

  if (!iconUrl) {
    panel.addTextDisplayComponents(messageText)
  }

  panel.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Edit Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(dashboardUrl)
    )
  )

  await interaction.editReply({
    components: [panel],
    flags: COMPONENTS_V2_FLAGS,
    allowedMentions: { users: [targetUser.id] },
  })
}
