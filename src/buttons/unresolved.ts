import {
  ButtonInteraction,
  Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'
import { getUnresolvedTickets } from '../commands/unresolved'
import {
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
  createSuccessPanel,
} from '../utils/componentsV2'

export const button = {
  name: 'unresolved',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return

  const type = interaction.customId.replace('unresolved_', '') as
    | 'all'
    | 'mod'
    | 'reviewer'
    | 'auctions'

  await interaction.deferUpdate()

  const result = await getUnresolvedTickets(interaction.guild, type)

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('unresolved_all')
      .setLabel('All')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('unresolved_mod')
      .setLabel('Mod')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('unresolved_reviewer')
      .setLabel('Reviewer')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('unresolved_auctions')
      .setLabel('Auctions')
      .setStyle(ButtonStyle.Secondary)
  )

  if (result.title === 'Error') {
    const panel = createErrorPanel(
      'Error',
      result.content
    ).addActionRowComponents(row)

    await interaction.editReply({
      components: [panel],
      flags: COMPONENTS_V2_FLAGS,
      allowedMentions: { parse: [] },
    })
    return
  }

  const panel = createSuccessPanel(
    result.title,
    result.content
  ).addActionRowComponents(row)

  await interaction.editReply({
    components: [panel],
    flags: COMPONENTS_V2_FLAGS,
    allowedMentions: { parse: [] },
  })
}
