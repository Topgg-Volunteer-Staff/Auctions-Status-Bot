import {
  Client,
  CommandInteraction,
  EmbedBuilder,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js'

export const command = new SlashCommandBuilder()
  .setName('auctions')
  .setDescription(`Get useful information about Top.gg's Auctions.`)
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions('0')

export const execute = async (
  _client: Client,
  interaction: CommandInteraction
) => {
  const now = new Date()

  const getNextUtcDate = (targetDay: number, hourUTC: number) => {
    const result = new Date(now)
    const currentDay = now.getUTCDay()

    let daysUntilTarget = targetDay - currentDay
    if (
      daysUntilTarget < 0 ||
      (daysUntilTarget === 0 && now.getUTCHours() >= hourUTC)
    ) {
      daysUntilTarget += 7
    }

    result.setUTCDate(now.getUTCDate() + daysUntilTarget)
    result.setUTCHours(hourUTC, 0, 0, 0)
    return result
  }

  const monday19UTC = getNextUtcDate(1, 19) // Monday @ 19:00 UTC
  const tuesday19UTC = getNextUtcDate(2, 19) // Tuesday @ 19:00 UTC
  const tuesday20UTC = getNextUtcDate(2, 20) // Tuesday @ 20:00 UTC

  const embed = new EmbedBuilder()
    .setTitle('Auctions Information')
    .setDescription(
      'You can find out more about Top.gg auctions on the [Auctions Support Article](https://support.top.gg/support/solutions/articles/73000508264-how-do-i-use-auctions-)'
    )
    .addFields(
      {
        name: '🕓 Bidding Ends',
        value: `<t:${Math.floor(
          monday19UTC.getTime() / 1000
        )}:f> (<t:${Math.floor(monday19UTC.getTime() / 1000)}:R>)`,
      },
      {
        name: '💳 Payment Due & New Bidding Opens',
        value: `<t:${Math.floor(
          tuesday19UTC.getTime() / 1000
        )}:f> (<t:${Math.floor(tuesday19UTC.getTime() / 1000)}:R>)`,
      },
      {
        name: '📢 Ads Go Live',
        value: `<t:${Math.floor(
          tuesday20UTC.getTime() / 1000
        )}:f> (<t:${Math.floor(tuesday20UTC.getTime() / 1000)}:R>)`,
      }
    )
    .setColor('#ff3366')

  interaction.reply({ embeds: [embed] })
}
