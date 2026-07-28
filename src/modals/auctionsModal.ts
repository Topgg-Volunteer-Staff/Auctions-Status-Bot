import {
  ModalSubmitInteraction,
  Client,
  ChannelType,
  ContainerBuilder,
  TextChannel,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js'
import { channelIds, roleIds } from '../globals'
import { emoji } from '../utils/emojis'
import {
  COMPONENTS_V2_FLAGS,
  createErrorPanel,
  createSuccessPanel,
} from '../utils/componentsV2'
import { sendDmOnResponsesPrompt } from '../utils/tickets/dmOnResponses'

function createAuctionsTicketPanel(
  notificationContent: string,
  title: string,
  description: string
): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(0xff3366)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(notificationContent),
      new TextDisplayBuilder().setContent(`## ${title}`),
      new TextDisplayBuilder().setContent(description)
    )
}

export const modal = {
  name: 'auctionsModal',
}

export const execute = async (
  _client: Client,
  interaction: ModalSubmitInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const auctionsTickets = interaction.client.channels.cache.get(
    channelIds.auctionsTickets
  ) as TextChannel

  const existing = (await auctionsTickets.threads.fetchActive()).threads.find(
    (t) => t.name === `${interaction.user.username}`
  )

  if (existing) {
    await interaction.editReply({
      components: [
        createErrorPanel(
          `Can't open a new ticket!`,
          `You already have an open Auctions support ticket. Please go to <#${existing.id}> for support.`
        ),
      ],
      flags: COMPONENTS_V2_FLAGS,
    })
    return
  }

  const userInput = interaction.fields.getTextInputValue('issueDescription')
  const date = new Date()

  const thread = await auctionsTickets.threads.create({
    name: `${interaction.user.username}`,
    autoArchiveDuration: 10080,
    type: ChannelType.PrivateThread,
  })

  // Prepare ticket notification
  let description = `${emoji.dotred} If your issue is related to payments you have made, please include your FastSpring order ID starting with \`DBOTSBV••••\`.`
  if (date.getDay() === 6 || date.getDay() === 0) {
    description += `\n\n${emoji.warning} Please note that weekend support is limited. A Support Team member will be with you as soon as possible on Monday morning!`
  } else {
    description += `\n\nA Support Team member will be with you as soon as possible!`
  }

  const notificationContent = `<@&${roleIds.supportTeam}>, <@${interaction.user.id}> has created an Auctions ticket.`
  const ticketPanel = createAuctionsTicketPanel(
    notificationContent,
    `This is your Private Top.gg Auctions Support Thread, ${interaction.user.username}!`,
    description
  )

  // Send ticket notification first
  await thread.send({
    components: [ticketPanel],
    flags: COMPONENTS_V2_FLAGS,
    allowedMentions: {
      parse: [],
      roles: [roleIds.supportTeam],
      users: [interaction.user.id],
    },
  })

  await sendDmOnResponsesPrompt(thread, interaction.user.id)

  // Then send the user input as a webhook message to mimic the user
  const webhook = await auctionsTickets.createWebhook({
    name: interaction.user.username,
    avatar: interaction.user.displayAvatarURL(),
  })

  await webhook.send({
    content: userInput,
    threadId: thread.id,
    allowedMentions: { users: [] },
  })

  // Delete webhook after use !!
  await webhook.delete()

  await interaction.editReply({
    components: [
      createSuccessPanel(
        `Ticket opened!`,
        `Your ticket has been created at <#${thread.id}>, please head there for assistance!`
      ),
    ],
    flags: COMPONENTS_V2_FLAGS,
  })

  return
}
