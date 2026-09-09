import {
  ChatInputCommandInteraction,
  Client,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js'

import { roleIds } from '../globals'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
  createTextPanel,
} from '../utils/componentsV2'
import { getDisputeAuditTotals } from '../utils/db/disputeAudits'

const auditColor = 0xff3366
const barLength = 20

const formatPercentage = (count: number, total: number): string =>
  total === 0 ? '0%' : `${Math.round((count / total) * 100)}%`

const buildRatioBar = (yes: number, total: number): string => {
  if (total === 0) return '─'.repeat(barLength)

  const filled = Math.max(0, Math.min(barLength, Math.round((yes / total) * barLength)))
  return `${'█'.repeat(filled)}${'░'.repeat(barLength - filled)}`
}

const formatRatio = (yes: number, no: number): string => {
  if (no === 0) return yes === 0 ? 'n/a' : `${yes}:0`

  return `${(yes / no).toFixed(2)}:1`
}

export const command = new SlashCommandBuilder()
  .setName('dispute-audit')
  .setDescription('Show how many disputes were caused by a reviewer mistake')
  .setContexts(InteractionContextType.Guild)

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
      allowedMentions: { parse: [] },
    })
    return
  }

  const isModPlus =
    interaction.member.roles.cache.has(roleIds.moderator) ||
    interaction.member.permissions.has(PermissionFlagsBits.Administrator)

  if (!isModPlus) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'Missing permissions',
          'Only moderators can use this command.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      allowedMentions: { parse: [] },
    })
    return
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  try {
    const { yes, no } = await getDisputeAuditTotals()
    const total = yes + no

    const panel = createTextPanel({
      accentColor: auditColor,
      title: 'Dispute Audit',
      description: [
        'Answers to *"Was this ticket created because the reviewer made a mistake and needed to re-review?"*',
        '',
        `\`${buildRatioBar(yes, total)}\``,
        '',
        `**Yes** — reviewer mistake: **${yes}** (${formatPercentage(yes, total)})`,
        `**No** — dispute was unfounded: **${no}** (${formatPercentage(no, total)})`,
        '',
        `**Ratio (yes:no):** ${formatRatio(yes, no)}`,
      ].join('\n'),
    }).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        total === 0
          ? '-# No disputes have been audited yet.'
          : `-# ${total} audited dispute${total === 1 ? '' : 's'}`
      )
    )

    await interaction.editReply({
      components: [panel],
      flags: COMPONENTS_V2_FLAGS,
      allowedMentions: { parse: [] },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load dispute audits.'

    await interaction.editReply({
      components: [createErrorPanel('Audit failed', message)],
      flags: COMPONENTS_V2_FLAGS,
      allowedMentions: { parse: [] },
    })
  }
}
