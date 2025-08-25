import {
  Client,
  CommandInteraction,
  GuildMember,
  SlashCommandBuilder,
  MessageFlags,
} from 'discord.js'

const STAFF_ROLE_ID = '1324896486130974720'
const NOTIFY_ROLE_ID = '1405176681785725071'

export const command = new SlashCommandBuilder()
  .setName('reviewer-notify')
  .setDescription('Toggle receiving reviewer notifications')

export const execute = async (
  _client: Client,
  interaction: CommandInteraction
) => {
  if (!interaction.inCachedGuild()) {
    return interaction.reply({
      content: 'This command can only be used in a server.',
      flags: MessageFlags.Ephemeral,
    })
  }

  const member = interaction.member as GuildMember

  // Check if they have the staff role
  if (!member.roles.cache.has(STAFF_ROLE_ID)) {
    return interaction.reply({
      content: '❌ You do not have permission to use this command.',
      flags: MessageFlags.Ephemeral,
    })
  }

  // Toggle the notify role
  if (member.roles.cache.has(NOTIFY_ROLE_ID)) {
    await member.roles.remove(NOTIFY_ROLE_ID)
    return interaction.reply({
      content: '🔕 You will no longer receive reviewer dispute notifications.',
      flags: MessageFlags.Ephemeral,
    })
  } else {
    await member.roles.add(NOTIFY_ROLE_ID)
    return interaction.reply({
      content: '🔔 You will now receive reviewer dispute notifications.',
      flags: MessageFlags.Ephemeral,
    })
  }
}
