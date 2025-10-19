import { ButtonInteraction, Client } from 'discord.js'
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

  if (result.title === 'Error') {
    await interaction.editReply({
      embeds: [errorEmbed('Error', result.content)],
      components: [], // Remove buttons on error
    })
    return
  }

  await interaction.editReply({
    embeds: [successEmbed(result.title, result.content)],
    components: [], // Remove buttons after selection
  })
}
