import { EmbedBuilder } from 'discord.js'
import { emoji } from '../emojis'

export const successEmbed = (title: string, description?: string) => {
  const res = new EmbedBuilder()
    .setColor('#00CC88')
    .setTitle(`${emoji.online} ${title}`)
  if (description) res.setDescription(description)
  return res
}
