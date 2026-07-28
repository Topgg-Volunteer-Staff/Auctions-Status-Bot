import {
  ActionRowBuilder,
  Client,
  CommandInteraction,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextChannel,
  TextDisplayBuilder,
} from 'discord.js'
import { roleIds } from '../globals'
import { emoji } from '../utils/emojis'

const ticketMenuCustomIds = new Set([
  'mod_ticket_select',
  'reviewer_ticket_select',
])

const containsTicketMenu = (component: unknown): boolean => {
  if (typeof component !== 'object' || component === null) return false

  const data = component as {
    custom_id?: unknown
    components?: unknown
  }

  if (
    typeof data.custom_id === 'string' &&
    ticketMenuCustomIds.has(data.custom_id)
  ) {
    return true
  }

  return (
    Array.isArray(data.components) &&
    data.components.some((child) => containsTicketMenu(child))
  )
}

export const command = new SlashCommandBuilder()
  .setName('createmodticket')
  .setDescription('Post the create mod ticket message')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions('0')

export const execute = async (
  _client: Client,
  interaction: CommandInteraction
) => {
  if (!interaction.inCachedGuild()) return

  const channel = interaction.channel as TextChannel

  // Delete both legacy embed panels and the current Components V2 panel.
  try {
    const messages = await channel.messages.fetch({ limit: 100 })
    for (const [, message] of messages) {
      const hasLegacyTicketEmbed = message.embeds.some(
        (embed) =>
          embed.title?.includes('Contact a Moderator') === true ||
          embed.title?.includes('Contact a Reviewer') === true
      )
      const hasTicketMenu = message.components.some((component) =>
        containsTicketMenu(component.toJSON())
      )

      if (hasLegacyTicketEmbed || hasTicketMenu) {
        await message.delete()
      }
    }
  } catch (error) {
    console.warn('Failed to delete existing mod ticket messages:', error)
  }

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
        label: 'Report',
        value: 'report',
        description: 'Report bots, servers, users, reviews or other issues',
      },
      {
        label: 'Request ownership transfer',
        value: 'transfer_ownership',
        description: 'Transfer ownership of a bot or server',
      },
      {
        label: 'Other',
        value: 'other',
        description: 'General help or other issues',
      },
      {
        label: 'Have an issue with a Moderator?',
        value: 'issue_with_moderator',
        description: 'Contact support about a moderator issue',
      },
    ])

  // Reviewer select menu
  const reviewerSelectMenu = new StringSelectMenuBuilder()
    .setCustomId('reviewer_ticket_select')
    .setPlaceholder('Select a reason to contact a reviewer')
    .addOptions([
      {
        label: 'DISPUTE - Why was my project declined?',
        value: 'dispute_decline',
      },
      {
        label: 'When will my bot be reviewed?',
        value: 'info_bot_review',
      },
      {
        label: 'When will my server be reviewed?',
        value: 'info_server_review',
      },
      {
        label: "How do I check my project's position in the queue?",
        value: 'info_projectstatus',
      },
      {
        label: 'How do I become a Reviewer?',
        value: 'info_reviewer_app',
      },
      {
        label: 'Have an issue with a Reviewer?',
        value: 'issue_with_reviewer',
      },
    ])

  const moderatorPanel = new ContainerBuilder()
    .setAccentColor(0xe91e63)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emoji.sunglasses} Contact a Moderator\nNeed help or want to report something? Use the menu below to open a private ticket with our <@&${roleIds.moderator}> team.`
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        modSelectMenu
      )
    )

  const reviewerPanel = new ContainerBuilder()
    .setAccentColor(0xff6b00)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emoji.sunglasses} Contact a Reviewer\nNeed help with a bot, server, or roblox game dispute? Use the menu below to open a private ticket with our <@&${roleIds.reviewer}> team.`
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        reviewerSelectMenu
      )
    )

  await channel.send({
    components: [moderatorPanel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  })

  await channel.send({
    components: [reviewerPanel],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  })

  await interaction.reply({
    content: 'Moderator and reviewer ticket panels sent.',
    flags: MessageFlags.Ephemeral,
  })
}
