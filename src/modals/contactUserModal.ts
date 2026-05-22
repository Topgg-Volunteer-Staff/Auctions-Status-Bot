import {
  ModalSubmitInteraction,
  Client,
  TextChannel,
  ThreadAutoArchiveDuration,
  EmbedBuilder,
  DiscordAPIError,
  MessageFlags,
  MessageType,
  type Collection,
  type Attachment,
} from 'discord.js'
import { channelIds } from '../globals'
import { errorEmbed } from '../utils/embeds/errorEmbed'
import { successEmbed } from '../utils/embeds/successEmbed'
import { sendDmOnResponsesPrompt } from '../utils/tickets/dmOnResponses'

const EXPECTED_DM_ERROR_CODES = new Set([50007, 50278])

function isExpectedDmError(error: unknown): boolean {
  if (error instanceof DiscordAPIError) {
    return (
      typeof error.code === 'number' && EXPECTED_DM_ERROR_CODES.has(error.code)
    )
  }

  if (!(error instanceof Error)) return false

  return /cannot send messages to this user|no mutual guilds/i.test(
    error.message
  )
}

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
  let uploadedFiles: Array<Attachment> = []
  try {
    const files = interaction.fields.getUploadedFiles('fileUpload') as
      | Collection<string, Attachment>
      | undefined
    uploadedFiles = files ? Array.from(files.values()) : []
  } catch {
    uploadedFiles = []
  }

  // parse user id from customId (_ as separator)
  const userId = interaction.customId.split('_')[1]

  if (!userId) {
    await interaction.editReply({
      embeds: [
        errorEmbed('Invalid User', 'Could not determine the user to contact.'),
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

    await sendDmOnResponsesPrompt(thread, userId)

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
    })

    let dmFailureMessage: string | null = null
    try {
      await user.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('A staff member opened a ticket for you')
            .setColor('#E91E63')
            .setDescription(
              `${interaction.user} opened a ticket for you in ${interaction.guild.name}.\n\n[Open Ticket](${sentMessage.url})`
            )
            .setTimestamp(),
        ],
      })
    } catch (dmError) {
      dmFailureMessage = isExpectedDmError(dmError)
        ? 'The ticket was created, but I could not DM the user about it. They likely have DMs disabled.'
        : 'The ticket was created, but I could not DM the user about it.'

      if (!isExpectedDmError(dmError)) {
        console.error('Failed to DM contacted user about ticket creation:', dmError)
      }
    }

    await sentMessage.pin()

    // If there are uploaded files, send them as a separate follow-up message
    if (uploadedFiles.length > 0) {
      try {
        await thread.send({ files: uploadedFiles })
      } catch (fileErr) {
        console.error(
          'Failed to send uploaded files as separate message:',
          fileErr
        )
      }
    }

    // Delete the auto-generated system "pinned a message" notice
    try {
      const recent = await thread.messages.fetch({ limit: 5 })
      const pinNotice = recent.find(
        (m) => m.type === MessageType.ChannelPinnedMessage
      )
      if (pinNotice) {
        await pinNotice.delete().catch(() => void 0)
      }
    } catch {
      // ignore
    }

    await interaction.editReply({
      embeds: [
        successEmbed(
          'Ticket opened!',
          dmFailureMessage
            ? `Your ticket has been created at <#${thread.id}>.\n\n${dmFailureMessage}`
            : `Your ticket has been created at <#${thread.id}>.`
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
