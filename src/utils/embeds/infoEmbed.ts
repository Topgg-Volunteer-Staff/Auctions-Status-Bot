import { EmbedBuilder } from 'discord.js'
import { emoji } from '../emojis'

export const infoEmbed = (message?: string) => {
  const res = new EmbedBuilder()
    .setColor('#00BBFF')
    .setDescription(`${emoji.blueinfo} ${message}`)
  return res
}
