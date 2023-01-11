import { EmbedBuilder } from 'discord.js'
import { emoji } from '../emojis'

export const errorEmbed = (title: string, description?: string) => {
  const res = new EmbedBuilder()
    .setColor('#ff3366')
    .setTitle(`${emoji.error} ${title}`)
  if (description) res.setDescription(description)
  return res
}
