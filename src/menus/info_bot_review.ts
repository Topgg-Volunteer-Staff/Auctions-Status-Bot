import { Client, StringSelectMenuInteraction } from 'discord.js'
import {
  COMPONENTS_V2_EPHEMERAL_FLAGS,
  createTextPanel,
} from '../utils/componentsV2'

export const menu = {
  name: 'info_bot_review',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  await interaction.update({})

  const REVIEWING_PROCESS_URL =
    'https://support.top.gg/hc/en-us/articles/23135298323996-How-the-Bot-Reviewal-Process-Works'
  const BOT_GUIDELINES_URL =
    'https://support.top.gg/hc/en-us/articles/23146912808988-Discord-Bot-Guidelines'

  const panel = createTextPanel({
    accentColor: 0xe91e63,
    title: 'When will my bot be reviewed?',
    description: `**Our average review time is 1 week or more.**\n\nSome bots may take longer to review than others depending on their features. Because of this, we can't guarantee your bot will be reviewed as quickly as someone else's, and there's no exact timeframe for approval. There's also no way to check your position in the queue — but remember, you're not first or last!\n\nYou're free to edit your bot's page anytime, both before and after review. This won't affect your place in the queue.\n\nYou can read more about our review process here: **[How the Reviewing Process Works.](${REVIEWING_PROCESS_URL})**\n\n<:topgg_ico_bulb:1026877525261033563> In the meantime, please make sure your bot follows all of our **[Bot Guidelines](${BOT_GUIDELINES_URL})** for a quick and smooth approval!`,
  })

  await interaction.followUp({
    components: [panel],
    flags: COMPONENTS_V2_EPHEMERAL_FLAGS,
  })
}
