import {
  ModalSubmitInteraction,
  Client,
  TextChannel,
  ThreadAutoArchiveDuration,
  DiscordAPIError,
  MessageFlags,
  MessageType,
  TextDisplayBuilder,
  type Collection,
  type Attachment,
} from 'discord.js'
import { channelIds } from '../globals'
import {
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
  createSuccessPanel,
  createTextPanel,
} from '../utils/componentsV2'
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
      components: [createErrorPanel('Error', 'Mod tickets channel not found.')],
      flags: COMPONENTS_V2_FLAGS,
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
      components: [
        createErrorPanel(
          'Invalid User',
          'Could not determine the user to contact.'
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
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

    const ticketPanel = createTextPanel({
      accentColor: 0xe91e63,
      title: `Contact ${username}`,
      description: botId
        ? `**Bot ID:** ${botId}\n**Reason:** ${reason}`
        : `**Reason:** ${reason}`,
    })
      .spliceComponents(
        0,
        0,
        new TextDisplayBuilder().setContent(
          `<@${userId}>, ${interaction.user} would like to talk to you!`
        )
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# <t:${Math.floor(Date.now() / 1000)}:f>`
        )
      )

    const sentMessage = await thread.send({
      components: [ticketPanel],
      flags: COMPONENTS_V2_FLAGS,
      allowedMentions: {
        parse: [],
        users: [userId, interaction.user.id],
      },
    })

    let dmFailureMessage: string | null = null
    try {
      const dmPanel = createTextPanel({
        accentColor: 0xe91e63,
        title: 'A staff member opened a ticket for you',
        description: `${interaction.user} opened a ticket for you in ${interaction.guild.name}.\n\n[Open Ticket](${sentMessage.url})`,
      }).addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# <t:${Math.floor(Date.now() / 1000)}:f>`
        )
      )

      await user.send({
        components: [dmPanel],
        flags: COMPONENTS_V2_FLAGS,
        allowedMentions: { parse: [] },
      })
    } catch (dmError) {
      dmFailureMessage = isExpectedDmError(dmError)
        ? 'The ticket was created, but I could not DM the user about it. They likely have DMs disabled.'
        : 'The ticket was created, but I could not DM the user about it.'

      if (!isExpectedDmError(dmError)) {
        console.error(
          'Failed to DM contacted user about ticket creation:',
          dmError
        )
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
      components: [
        createSuccessPanel(
          'Ticket opened!',
          dmFailureMessage
            ? `Your ticket has been created at <#${thread.id}>.\n\n${dmFailureMessage}`
            : `Your ticket has been created at <#${thread.id}>.`
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
  } catch (error) {
    console.error('Error creating contact ticket:', error)
    await interaction.editReply({
      components: [
        createErrorPanel(
          'Error',
          'Failed to create user ticket. Please try again.'
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
  }
}
