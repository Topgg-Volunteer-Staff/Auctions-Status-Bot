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
    .setTitle(`${emoji.sunglasses} Staff Ask Me Anything Event`)
    .setDescription(
      'Click the button below to submit a question for the AMA!\n\n' +
        'This event gives our community the opportunity to ask us questions about all things Top.gg — from how the site works, to ideas for new features, to feedback on existing ones.\n\n' +
        'Please only submit questions related to Top.gg, its features, or things you’d like to see on the site.\n\n' +
        'Our Staff AMA will take place on <t:1757202000:F> (<t:1757202000:R>) — don’t miss your chance to be part of the conversation!'
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
