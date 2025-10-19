import {
  ButtonInteraction,
  Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js'
import { getUnresolvedTickets } from '../commands/unresolved'
import { successEmbed, errorEmbed } from '../utils/embeds'

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
    await interaction.editReply({
      embeds: [errorEmbed('Error', result.content)],
      components: [row],
    })
    return
  }

  await interaction.editReply({
    embeds: [successEmbed(result.title, result.content)],
    components: [row],
  })
}
