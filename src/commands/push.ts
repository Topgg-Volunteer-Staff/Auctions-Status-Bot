import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js'

import { roleIds } from '../globals'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
  createTextPanel,
} from '../utils/componentsV2'

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
          .setName('server-id')
          .setDescription('The internal server ID')
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
          .setName('bot-id')
          .setDescription('The Top.gg bot ID')
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

  const id =
    sub === 'server-complete'
      ? interaction.options.getString('server-id', true).trim()
      : interaction.options.getString('bot-id', true).trim()

  if (!SNOWFLAKE_PATTERN.test(id)) {
    await interaction.reply({
      components: [
        createErrorPanel(
          `Invalid ${sub === 'server-complete' ? 'server' : 'bot'} ID format!`
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const dashboardUrl =
    sub === 'server-complete'
      ? `https://top.gg/discord/servers/${id}/dashboard`
      : `https://top.gg/bot/${id}/dashboard`

  const publicUrl =
    sub === 'server-complete'
      ? `https://top.gg/discord/servers/${id}`
      : `https://top.gg/bot/${id}`

  const panel = createTextPanel({
    accentColor: 0x00cc88,
    title: '✅ Transfer Complete',
    description:
      `<@${targetUser.id}>\n\n` +
      `Your ${sub === 'server-complete' ? 'server' : 'bot'} has been transferred over! Here are the links and controls to your ${sub === 'server-complete' ? 'server' : 'bot'}.\n\n` +
      `**Edit:** [Dashboard](${dashboardUrl})\n` +
      `**Public Page:** [View Listing](${publicUrl}) (only if your ${sub === 'server-complete' ? 'server' : 'bot'} is live)\n\n` +
      'Let me know if you have any other questions! <:DoggThumbsUp:1400113319905329264>',
  }).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Edit Dashboard')
        .setStyle(ButtonStyle.Link)
        .setURL(dashboardUrl)
    )
  )

  await interaction.reply({
    components: [panel],
    flags: COMPONENTS_V2_FLAGS,
    allowedMentions: { users: [targetUser.id] },
  })
}
