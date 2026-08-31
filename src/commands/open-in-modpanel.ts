import {
  ChatInputCommandInteraction,
  Client,
  ContainerBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js'
import { roleIds } from '../globals'
import { COMPONENTS_V2_FLAGS, createErrorPanel } from '../utils/componentsV2'
import { sendErrorLog } from '../utils/errorLogging'
import {
  fetchTopggBotModPanelInfo,
  getTopggModPanelUrl,
  validateDiscordId,
} from '../utils/topggTeams'

export const command = new SlashCommandBuilder()
  .setName('open-in-modpanel')
  .setDescription('Open a bot in the Top.gg ModPanel')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((option) =>
    option
      .setName('bot-id')
      .setDescription('The Discord bot ID')
      .setMinLength(10)
      .setMaxLength(30)
      .setRequired(true)
  )

async function isStaff(member: {
  roles: { cache: { has: (id: string) => boolean } }
}): Promise<boolean> {
  return [roleIds.moderator, roleIds.reviewer, roleIds.trialReviewer].some(
    (id) => member.roles.cache.has(id)
  )
}

export const execute = async (
  _client: Client,
  interaction: ChatInputCommandInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  if (!(await isStaff(interaction.member))) {
    await interaction.editReply({
      components: [
        createErrorPanel(
          'No permission',
          'Only staff members (reviewers/mods) can use this command.'
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const botId = interaction.options.getString('bot-id', true).trim()

  try {
    const validatedBotId = validateDiscordId(botId)
    const modPanelInfo = await fetchTopggBotModPanelInfo(validatedBotId)

    if (!modPanelInfo) {
      await interaction.editReply({
        components: [
          createErrorPanel(
            'Bot not found',
            `Bot ID \`${validatedBotId}\` is not listed on Top.gg.`
          ),
        ],
        flags: COMPONENTS_V2_FLAGS,
      })
      return
    }

    const modPanelUrl = getTopggModPanelUrl(modPanelInfo.internalId)

    const panel = new ContainerBuilder()
      .setAccentColor(0xff3366)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('**Top.gg ModPanel**'),
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
      'openInModpanel.lookup.failed',
      error,
      { botId, userId: interaction.user.id }
    )

    await interaction.editReply({
      components: [
        createErrorPanel(
          'Invalid ID',
          'Please provide a valid Discord bot ID.'
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
  }
}
