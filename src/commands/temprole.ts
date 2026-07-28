import {
  ChatInputCommandInteraction,
  Client,
  InteractionContextType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'

import { roleIds } from '../globals'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  createErrorPanel,
  createSuccessPanel,
} from '../utils/componentsV2'
import {
  createOrReplaceTempRole,
  parseTempRoleDuration,
} from '../utils/tempRoles'

const MAX_TEMP_ROLE_MS = 180 * 24 * 60 * 60 * 1000

export const command = new SlashCommandBuilder()
  .setName('temprole')
  .setDescription('Give a user a role for a limited amount of time')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addRoleOption((option) =>
    option
      .setName('role')
      .setDescription('The role to give temporarily')
      .setRequired(true)
  )
  .addUserOption((option) =>
    option
      .setName('user')
      .setDescription('The user who should receive the role')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('length')
      .setDescription('How long the role should last, for example 30m, 12h, 7d')
      .setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName('reason')
      .setDescription('Why the user is receiving this temporary role')
      .setRequired(true)
      .setMaxLength(512)
  )

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'Server only',
          'This command can only be used in a server.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const hasModeratorRole = interaction.member.roles.cache.has(roleIds.moderator)
  const canManageRoles = interaction.member.permissions.has(
    PermissionFlagsBits.ManageRoles
  )

  if (!hasModeratorRole && !canManageRoles) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'No permission',
          'You need the moderator role or Manage Roles permission to use this command.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const targetRole = interaction.options.getRole('role', true)
  const targetUser = interaction.options.getUser('user', true)
  const durationInput = interaction.options.getString('length', true)
  const reason = interaction.options.getString('reason', true).trim()
  const durationMs = parseTempRoleDuration(durationInput)

  if (!durationMs) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'Invalid length',
          'Use a duration like 30m, 12h, 7d, 2w, or 1mo. You can combine them, for example 1d12h.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  if (durationMs > MAX_TEMP_ROLE_MS) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'Length too long',
          'Temporary roles are limited to 180 days.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const guild = interaction.guild
  const me = interaction.guild.members.me
  const targetMember = await guild.members
    .fetch(targetUser.id)
    .catch(() => null)

  if (!targetMember) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'Member not found',
          'That user is not in this server.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  if (!me) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'Bot unavailable',
          'The bot could not verify its server permissions.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  if (targetRole.id === guild.id) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'Invalid role',
          'The @everyone role cannot be assigned.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  if (targetRole.managed) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'Invalid role',
          'Managed roles cannot be assigned with this command.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  if (targetRole.position >= me.roles.highest.position) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'Role too high',
          "That role is above the bot's highest role, so I cannot assign or remove it later."
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  if (
    interaction.member.id !== guild.ownerId &&
    targetRole.position >= interaction.member.roles.highest.position
  ) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'Role too high',
          'You can only assign roles lower than your highest role.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const expiresAt = Date.now() + durationMs

  try {
    await targetMember.roles.add(
      targetRole,
      `Temporary role assigned by ${interaction.user.tag}: ${reason}`
    )

    try {
      await createOrReplaceTempRole({
        guildId: guild.id,
        userId: targetMember.id,
        roleId: targetRole.id,
        moderatorId: interaction.user.id,
        reason,
        expiresAt,
        createdAt: Date.now(),
      })
    } catch (error) {
      await targetMember.roles.remove(
        targetRole,
        'Rolled back temporary role because the expiration could not be saved.'
      )
      throw error
    }

    const expiryUnix = Math.floor(expiresAt / 1000)

    await interaction.reply({
      components: [
        createSuccessPanel(
          'Temporary role assigned',
          [
            `Assigned <@&${targetRole.id}> to <@${targetMember.id}>.`,
            `Expires <t:${expiryUnix}:R> on <t:${expiryUnix}:F>.`,
            `Reason: ${reason}`,
          ].join('\n')
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      allowedMentions: { users: [], roles: [] },
    })
  } catch (error) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'Failed to assign role',
          "Discord rejected the role update. Check the bot's role position and permissions."
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
  }
}
