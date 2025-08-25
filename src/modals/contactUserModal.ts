import {
  ModalSubmitInteraction,
  Client,
  TextChannel,
  ThreadAutoArchiveDuration,
  EmbedBuilder,
} from 'discord.js'
import { channelIds } from '../globals'
import { errorEmbed } from '../utils/embeds/errorEmbed'

export const modal = {
  name: 'contactUserModal',
}

export const execute = async (
  _client: Client,
  interaction: ModalSubmitInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return
  await interaction.deferReply({ ephemeral: true })

  const modTickets = interaction.client.channels.cache.get(
    channelIds.modTickets
  ) as TextChannel | undefined

  if (!modTickets) {
    await interaction.editReply({
      embeds: [errorEmbed('Error', 'Mod tickets channel not found.')],
    })
    return
  }

  const userId = interaction.fields.getTextInputValue('userId').trim()
  const reason = interaction.fields.getTextInputValue('reason').trim()

  if (!/^\d{17,19}$/.test(userId)) {
    await interaction.editReply({
      embeds: [
        errorEmbed(
          'Invalid User ID',
          'Please provide a valid Discord user ID.'
        ),
      ],
    })
    return
  }

  try {
    const user = await interaction.client.users.fetch(userId)
    const username = user.username

    const thread = await modTickets.threads.create({
      name: `Contact User - ${username}`,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      type: 12,
    })

    const embed = new EmbedBuilder()
      .setTitle('Contact user')
      .setColor('#E91E63')
      .setDescription(`**User ID:** ${userId}\n\n**Reason:** ${reason}.`)
      .setTimestamp()

    const sentMessage = await thread.send({
      content: `<@${userId}>, ${interaction.user} would like to talk to you!`,
      embeds: [embed],
    })

    await sentMessage.pin()

    const successEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Success!')
      .setDescription(
        `User ticket created successfully! Thread: <#${thread.id}>`
      )

    await interaction.editReply({
      embeds: [successEmbed],
    })
  } catch (error) {
    console.error('Error creating contact ticket:', error)
    await interaction.editReply({
      embeds: [
        errorEmbed('Error', 'Failed to create user ticket. Please try again.'),
      ],
    })
  }
}
