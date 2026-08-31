import {
  ButtonInteraction,
  Client,
  ComponentType,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js'
import { COMPONENTS_V2_FLAGS } from '../utils/componentsV2'
import { roleIds } from '../globals'
import { sendErrorLog } from '../utils/errorLogging'
import {
  fetchTopggBotModPanelInfo,
  getTopggModPanelUrl,
} from '../utils/topggTeams'

export const button = {
  name: 'staffTools',
}

async function isStaff(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.inCachedGuild()) return false

  const member =
    interaction.member ??
    (await interaction.guild.members.fetch(interaction.user.id).catch(() => null))
  if (!member) return false

  return [roleIds.moderator, roleIds.reviewer, roleIds.trialReviewer].some(
    (id) => member.roles.cache.has(id)
  )
}

function extractBotIdFromContent(content: string): string | null {
  const match = content.match(/Bot ID: `(\d+)`/)
  return match?.[1] ?? null
}

function getTextDisplayContent(component: unknown): Array<string> {
  if (typeof component !== 'object' || component === null) return []

  const data = component as {
    components?: unknown
    content?: unknown
    type?: unknown
  }

  if (
    data.type === ComponentType.TextDisplay &&
    typeof data.content === 'string'
  ) {
    return [data.content]
  }

  if (!Array.isArray(data.components)) return []
  return data.components.flatMap((child) => getTextDisplayContent(child))
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: 'This can only be used in a guild.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (!(await isStaff(interaction))) {
    await interaction.reply({
      content: 'Only staff members (reviewers/mods) can use this tool.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const message = interaction.message
  let botId: string | null = null

  // Extract bot ID from message content
  if (message.content) {
    botId = extractBotIdFromContent(message.content)
  }

  // Try to find in text display components
  if (!botId && message.components.length > 0) {
    const allContent = message.components.flatMap((component) =>
      getTextDisplayContent(component.toJSON())
    )
    for (const content of allContent) {
      botId = extractBotIdFromContent(content)
      if (botId) break
    }
  }

  if (!botId) {
    await interaction.editReply({
      content: 'Could not find bot ID in this ticket.',
    })
    return
  }

  try {
    const modPanelInfo = await fetchTopggBotModPanelInfo(botId)

    if (!modPanelInfo) {
      await interaction.editReply({
        content: 'This bot is not listed on Top.gg.',
      })
      return
    }

    const modPanelUrl = getTopggModPanelUrl(modPanelInfo.internalId)

    const panel = new ContainerBuilder()
      .setAccentColor(0xff3366)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('**Staff Tools**'),
        new TextDisplayBuilder().setContent(
          `[Open in ModPanel](${modPanelUrl})`
        ),
        new TextDisplayBuilder().setContent(
          `-# Review Status: ${modPanelInfo.reviewStatus ?? 'None'}`
        )
      )

    await interaction.editReply({
      components: [panel],
      flags: COMPONENTS_V2_FLAGS,
    })
  } catch (error) {
    await sendErrorLog(
      interaction.client,
      'staffTools.modPanelLookup.failed',
      error,
      { botId, userId: interaction.user.id }
    )

    await interaction.editReply({
      content:
        'Failed to fetch mod panel info. Please try again or check the logs.',
    })
  }
}
