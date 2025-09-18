import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  CommandInteraction,
  TextChannel,
  EmbedBuilder,
  PermissionsBitField,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { emoji } from '../utils/emojis'

export const command = new SlashCommandBuilder()
  .setName('staff-ama')
  .setDescription('Trigger the staff AMA embed')

export const execute = async (
  _client: Client,
  interaction: CommandInteraction
) => {
  if (
    !interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)
  )
    return

  const channel = interaction.channel
  if (!channel || !(channel instanceof TextChannel)) return

  const panelEmbed = new EmbedBuilder()
    .setTitle(`<:topgg_ico_microphone:1026877531296649256> Top.gg Public AMA`)
    .setDescription(
      `Ask your question(s) for our upcoming **Public AMA**, hosted <t:1765044000:f> in **[Stage](https://discord.com/channels/264445053596991498/829020599200383016)**!\n\n` +
        `Ever wanted to know what we have on our roadmap, how Top.gg is doing, or have personal questions for our Team? Now is your chance to ask them! ${emoji.pog}\n\n` +
        `Submit your questions by <t:1765044000:f>. Please note that we can't answer all questions!\n\n` +
        `> Set your reminder for our AMA here: https://discord.com/events/264445053596991498/1413912629596000316\n\n` +
        `**We look forward to seeing you and answering your question(s)!** ${emoji.onion}`
    )
    .setColor('#ff3366')

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('amaAsk')
      .setLabel('Ask a Question')
      .setStyle(ButtonStyle.Primary)
  )

  await channel.send({ embeds: [panelEmbed], components: [row] })
  await interaction.reply({
    content: '✅ AMA panel posted!',
    flags: MessageFlags.Ephemeral,
  })
}
