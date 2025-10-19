import { ButtonInteraction, Client, MessageFlags } from 'discord.js'
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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const result = await getUnresolvedTickets(interaction.guild, type)

  if (result.title === 'Error') {
    await interaction.editReply({
      embeds: [errorEmbed('Error', result.content)],
    })
    return
  }

  await interaction.editReply({
    embeds: [successEmbed(result.title, result.content)],
  })
}
