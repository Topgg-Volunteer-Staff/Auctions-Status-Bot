import { Client, StringSelectMenuInteraction } from 'discord.js'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  createTextPanel,
} from '../utils/componentsV2'

export const menu = {
  name: 'info_projectstatus',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  await interaction.update({})

  const panel = createTextPanel({
    accentColor: 0xe91e63,
    title: "How do I check my project's position in the queue?",
    description:
      '**There is no way to check the position in the queue right now.**\n\nThis is planned for the future and there is no ETA for when it will be implemented.\n\nIf you just want to verify that your project was submitted, you can check your project\'s page and see "Your project is currently in review" in a red banner.',
  })

  await interaction.followUp({
    components: [panel],
    flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
  })
}
