/* eslint-disable @typescript-eslint/no-non-null-assertion */
import {
  Client,
  CommandInteraction,
  InteractionContextType,
  SlashCommandBuilder,
} from 'discord.js'
import { adsNowLive, biddingClosed, bidReminder, bidRemovalsLocked, paymentReminder } from '../utils/embeds/auctions';

export const command = new SlashCommandBuilder()
  .setName('auctions')
  .setDescription(`Get useful information about Top.gg's Auctions.`)
  .setContexts(InteractionContextType.Guild)

export const execute = async (
  _client: Client,
  interaction: CommandInteraction
) => {
  const live = await adsNowLive();
  const ended = await biddingClosed();
  const reminder = bidReminder();
  const locked = bidRemovalsLocked();
  const payReminder = await paymentReminder();

  interaction.reply({
    embeds: [
      ...live.embeds!,
      ...ended.embeds!,
      ...reminder.embeds!,
      ...locked.embeds!,
      ...payReminder.embeds!
    ]
  });
}
