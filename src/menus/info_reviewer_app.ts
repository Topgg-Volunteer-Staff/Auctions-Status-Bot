import {
  Client,
  StringSelectMenuInteraction,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js'
import { emoji } from '../utils/emojis'

export const menu = {
  name: 'info_reviewer_app',
}

export const execute = async (
  _client: Client,
  interaction: StringSelectMenuInteraction
) => {
  if (!interaction.inCachedGuild()) return

  await interaction.update({})

  const embed = new EmbedBuilder()
    .setColor('#E91E63')
    .setTitle(`Volunteer Applications`)
    .setDescription(
      `Hey! It seems like you're interested in volunteering for Top.gg. We're glad for any help we can get regarding our server events, support articles, bot/server reviewing, moderation, and more!\n\n${emoji.br} Reviewers\nReviewers are Top.gg staff and must be 18 or older. Reviewers review the discord bots and servers submitted to the site before they are listed to make sure they follow our rules.\n\n${emoji.mod} Moderators\nReviewer is a stepping stone to Moderator - if you wish to be a Moderator you must first apply and be accepted as a Reviewer.\n\n${emoji.dotred} Applications are currently: **CLOSED**`
    )

  await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral })
}
