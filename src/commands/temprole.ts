import {
  ChatInputCommandInteraction,
  Client,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'

import { roleIds } from '../globals'
import { errorEmbed, successEmbed } from '../utils/embeds'
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
      embeds: [
        errorEmbed('Server only', 'This command can only be used in a server.'),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const hasModeratorRole = interaction.member.roles.cache.has(roleIds.moderator)
  const canManageRoles = interaction.member.permissions.has(
    PermissionFlagsBits.ManageRoles
  )

  if (!hasModeratorRole && !canManageRoles) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          'No permission',
          'You need the moderator role or Manage Roles permission to use this command.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
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
      embeds: [
        errorEmbed(
          'Invalid length',
          'Use a duration like 30m, 12h, 7d, 2w, or 1mo. You can combine them, for example 1d12h.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (durationMs > MAX_TEMP_ROLE_MS) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          'Length too long',
          'Temporary roles are limited to 180 days.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const guild = interaction.guild
  const me = interaction.guild.members.me
  const targetMember = await guild.members.fetch(targetUser.id).catch(() => null)

  if (!targetMember) {
    await interaction.reply({
      embeds: [
        errorEmbed('Member not found', 'That user is not in this server.'),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (!me) {
    await interaction.reply({
      embeds: [
        errorEmbed('Bot unavailable', 'The bot could not verify its server permissions.'),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (targetRole.id === guild.id) {
    await interaction.reply({
      embeds: [
        errorEmbed('Invalid role', 'The @everyone role cannot be assigned.'),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (targetRole.managed) {
    await interaction.reply({
      embeds: [
        errorEmbed('Invalid role', 'Managed roles cannot be assigned with this command.'),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (targetRole.position >= me.roles.highest.position) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          'Role too high',
          'That role is above the bot\'s highest role, so I cannot assign or remove it later.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (
    interaction.member.id !== guild.ownerId &&
    targetRole.position >= interaction.member.roles.highest.position
  ) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          'Role too high',
          'You can only assign roles lower than your highest role.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
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
      embeds: [
        successEmbed(
          'Temporary role assigned',
          [`Assigned <@&${targetRole.id}> to <@${targetMember.id}>.`, `Expires <t:${expiryUnix}:R> on <t:${expiryUnix}:F>.`, `Reason: ${reason}`].join('\n')
        ),
      ],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { users: [], roles: [] },
    })
  } catch (error) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          'Failed to assign role',
          'Discord rejected the role update. Check the bot\'s role position and permissions.'
        ),
      ],
      flags: MessageFlags.Ephemeral,
    })
  }
}