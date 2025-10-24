import {
  ModalSubmitInteraction,
  Client,
  TextChannel,
  ThreadAutoArchiveDuration,
  EmbedBuilder,
  MessageFlags,
  MessageType,
} from 'discord.js'
import { channelIds } from '../globals'
import { errorEmbed } from '../utils/embeds/errorEmbed'
import { successEmbed } from '../utils/embeds/successEmbed'

export const modal = {
  name: 'contactUserModal',
}

export const execute = async (
  _client: Client,
  interaction: ModalSubmitInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const modTickets = interaction.client.channels.cache.get(
    channelIds.modTickets
  ) as TextChannel | undefined

  if (!modTickets) {
    await interaction.editReply({
      embeds: [errorEmbed('Error', 'Mod tickets channel not found.')],
    })
    return
  }

  const reason = interaction.fields.getTextInputValue('reason').trim()

  // Get bot ID if provided
  let botId = ''
  try {
    botId = interaction.fields.getTextInputValue('botId').trim()
  } catch {
    botId = ''
  }

  // Get uploaded files if any
  let uploadedFiles: any[] = []
  try {
    const files = interaction.fields.getUploadedFiles('fileUpload')
    uploadedFiles = files ? Array.from(files.values()) : []
  } catch {
    uploadedFiles = []
  }

  // Get selected user from the user select component
  let userId = ''
  try {
    const selectedUsers = interaction.fields.getSelectedUsers(
      'contactUserSelect',
      true
    )
    const firstUser = selectedUsers.first()
    userId = firstUser?.id ?? ''
  } catch {
    await interaction.editReply({
      embeds: [
        errorEmbed('No User Selected', 'Please select a user to contact.'),
      ],
    })
    return
  }

  if (!userId) {
    await interaction.editReply({
      embeds: [
        errorEmbed('No User Selected', 'Please select a user to contact.'),
      ],
    })
    return
  }

  try {
    const user = await interaction.client.users.fetch(userId)
    const username = user.username

    const threadName = `Contact User - ${username} <> ${interaction.user.username}`

    const thread = await modTickets.threads.create({
      name: threadName,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      type: 12,
    })

    const embed = new EmbedBuilder()
      .setTitle(`Contact ${username}`)
      .setColor('#E91E63')
      .setDescription(
        botId
          ? `**Bot ID:** ${botId}\n**Reason:** ${reason}`
          : `**Reason:** ${reason}`
      )
      .setTimestamp()

    const sentMessage = await thread.send({
      content: `<@${userId}>, ${interaction.user} would like to talk to you!`,
      embeds: [embed],
      ...(uploadedFiles.length > 0 && { files: uploadedFiles }),
    })

    await sentMessage.pin()

    // Delete the auto-generated system "pinned a message" notice
    try {
      const recent = await thread.messages.fetch({ limit: 5 })
      const pinNotice = recent.find(
        (m) => m.type === MessageType.ChannelPinnedMessage
      )
      if (pinNotice) {
        await pinNotice.delete().catch(() => {})
      }
    } catch {
      // ignore
    }

    await interaction.editReply({
      embeds: [
        successEmbed(
          'Ticket opened!',
          `Your ticket has been created at <#${thread.id}>.`
        ),
      ],
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
