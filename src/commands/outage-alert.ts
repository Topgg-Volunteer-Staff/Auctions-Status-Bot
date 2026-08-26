import {
  ChatInputCommandInteraction,
  Client,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js'

import { roleIds } from '../globals'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  createErrorPanel,
  createSuccessPanel,
  createTextPanel,
} from '../utils/componentsV2'
import {
  clearCustomAlert,
  editCustomAlert,
  getCustomAlertState,
  setCustomAlert,
  setCustomAlertVisibility,
} from '../utils/customAlert'
import { emoji } from '../utils/emojis'

export const command = new SlashCommandBuilder()
  .setName('outage-alert')
  .setDescription('Manage the known-outage alert shown on ticket panels')
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((sub) =>
    sub
      .setName('set')
      .setDescription('Post a new alert and make it visible')
      .addStringOption((option) =>
        option
          .setName('message')
          .setDescription('The alert message')
          .setRequired(true)
          .setMaxLength(1000)
      )
      .addStringOption((option) =>
        option
          .setName('title')
          .setDescription('Optional heading (defaults to "Known Issue")')
          .setMaxLength(100)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('Edit the current alert without changing its visibility')
      .addStringOption((option) =>
        option
          .setName('message')
          .setDescription('The new alert message')
          .setRequired(true)
          .setMaxLength(1000)
      )
      .addStringOption((option) =>
        option.setName('title').setDescription('Optional new heading').setMaxLength(100)
      )
  )
  .addSubcommand((sub) =>
    sub.setName('hide').setDescription('Hide the alert without deleting it')
  )
  .addSubcommand((sub) =>
    sub.setName('show').setDescription('Show the currently hidden alert')
  )
  .addSubcommand((sub) =>
    sub.setName('clear').setDescription('Delete the alert entirely')
  )
  .addSubcommand((sub) =>
    sub.setName('status').setDescription('View the current alert configuration')
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

  if (!interaction.member.roles.cache.has(roleIds.moderator)) {
    await interaction.reply({
      components: [
        createErrorPanel(
          'No permission',
          'You need the moderator role to use this command.'
        ),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
    })
    return
  }

  const sub = interaction.options.getSubcommand()

  if (sub === 'set' || sub === 'edit') {
    const message = interaction.options.getString('message', true).trim()
    const title = interaction.options.getString('title')?.trim() || null

    if (!message) {
      await interaction.reply({
        components: [
          createErrorPanel('Invalid message', 'The alert message cannot be empty.'),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
      return
    }

    try {
      if (sub === 'set') {
        await setCustomAlert({
          message,
          title,
          updatedBy: interaction.user.id,
        })
      } else {
        const existing = getCustomAlertState()
        if (!existing.message) {
          await interaction.reply({
            components: [
              createErrorPanel(
                'No alert to edit',
                'There is no existing alert. Use `/outage-alert set` to post one first.'
              ),
            ],
            flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
          })
          return
        }

        await editCustomAlert({
          message,
          title,
          updatedBy: interaction.user.id,
        })
      }

      await interaction.reply({
        components: [
          createSuccessPanel(
            sub === 'set' ? 'Alert posted' : 'Alert updated',
            `**${title ?? 'Known Issue'}**\n${message}`
          ),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
    } catch {
      await interaction.reply({
        components: [createErrorPanel('Save failed', 'Please try again.')],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
    }

    return
  }

  if (sub === 'hide' || sub === 'show') {
    const state = getCustomAlertState()

    if (!state.message) {
      await interaction.reply({
        components: [
          createErrorPanel(
            'No alert configured',
            'There is no alert to show or hide. Use `/outage-alert set` first.'
          ),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
      return
    }

    try {
      await setCustomAlertVisibility(sub === 'show', interaction.user.id)

      await interaction.reply({
        components: [
          createSuccessPanel(
            sub === 'show' ? 'Alert shown' : 'Alert hidden',
            sub === 'show'
              ? 'The alert will now appear on ticket panels again.'
              : 'The alert is hidden and will no longer appear on ticket panels. Its content is kept.'
          ),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
    } catch {
      await interaction.reply({
        components: [createErrorPanel('Save failed', 'Please try again.')],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
    }

    return
  }

  if (sub === 'clear') {
    try {
      await clearCustomAlert(interaction.user.id)

      await interaction.reply({
        components: [
          createSuccessPanel('Alert cleared', 'The alert has been deleted.'),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
    } catch {
      await interaction.reply({
        components: [createErrorPanel('Save failed', 'Please try again.')],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
    }

    return
  }

  if (sub === 'status') {
    const state = getCustomAlertState()

    if (!state.message) {
      await interaction.reply({
        components: [
          createTextPanel({
            accentColor: 0x00bbff,
            description: `${emoji.blueinfo} No alert is currently configured.`,
          }),
        ],
        flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      })
      return
    }

    const updatedLine = state.updatedAt
      ? `\n\n-# Last updated <t:${Math.floor(state.updatedAt / 1000)}:R> by ${
          state.updatedBy ? `<@${state.updatedBy}>` : 'unknown'
        }`
      : ''

    await interaction.reply({
      components: [
        createTextPanel({
          accentColor: state.visible ? 0xffcc00 : 0x808080,
          title: `${state.visible ? emoji.warning : emoji.offline} ${
            state.title ?? 'Known Issue'
          } (${state.visible ? 'visible' : 'hidden'})`,
          description: `${state.message}${updatedLine}`,
        }),
      ],
      flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
      allowedMentions: { users: [] },
    })
    return
  }

  await interaction.reply({
    components: [
      createErrorPanel(
        'Unknown subcommand',
        'Please choose one of: set, edit, hide, show, clear, status.'
      ),
    ],
    flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
  })
}
