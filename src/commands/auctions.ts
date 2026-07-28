/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  Client,
  CommandInteraction,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import {
  adsNowLive,
  biddingClosed,
  bidReminder,
  bidRemovalsLocked,
  paymentReminder,
} from '../utils/embeds/auctions'

export const command = new SlashCommandBuilder()
  .setName('auctions')
  .setDescription(`Get useful information about Top.gg's Auctions.`)
  .setContexts(InteractionContextType.Guild)

export const execute = async (
  _client: Client,
  interaction: CommandInteraction
) => {
  const live = await adsNowLive()
  const ended = await biddingClosed()
  const reminder = bidReminder()
  const locked = bidRemovalsLocked()
  const payReminder = await paymentReminder()

  await interaction.reply({
    components: [
      ...(live.components ?? []),
      ...(ended.components ?? []),
      ...(reminder.components ?? []),
      ...(locked.components ?? []),
      ...(payReminder.components ?? []),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  })
}
