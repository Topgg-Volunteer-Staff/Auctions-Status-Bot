import {
  ButtonInteraction,
  ChannelType,
  Client,
  PermissionsBitField,
  MessageFlags
} from 'discord.js'

export const button = {
  name: 'closeModTicket',
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  if (!interaction.inCachedGuild()) return

  const thread = interaction.channel
  if (!thread || thread.type !== ChannelType.PrivateThread) {
    await interaction.reply({
      content: 'This button must be used inside a private thread.',
         flags: MessageFlags.Ephemeral

    })
    return
  }

  const [, userId] = interaction.customId.split('_')

  const isOpener = interaction.user.id === userId
  const isModerator = interaction.member.permissions.has(
    PermissionsBitField.Flags.ManageThreads
  )

  if (!isOpener && !isModerator) {
    await interaction.reply({
      content: 'You are not allowed to close this ticket.',
        flags: MessageFlags.Ephemeral

    })
    return
  }

  try {
    await interaction.reply({
      content: `This ticket has been locked and archived by <@${interaction.user.id}>. Still need help? Create another ticket in <#1285771377160491049>`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { users: [] },
    })

    if (!thread.name.startsWith('[Resolved]')) {
      await thread.setName(`[Resolved] ${thread.name}`)
    }

    await thread.setLocked(true, 'Ticket closed')
    await thread.setArchived(true, 'Ticket closed by user')
  } catch (err) {
    console.error('Failed to close thread:', err)
  }
}
