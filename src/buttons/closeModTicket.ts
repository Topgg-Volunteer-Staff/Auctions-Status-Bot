import { ButtonInteraction, Client, MessageFlags } from 'discord.js'

export const button = {
  name: 'closeModTicket',
}

// Closing tickets via button is no longer allowed for anyone, including
// staff — this only survives on old ticket messages. Staff now close
// tickets with the /resolve command instead.
export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  await interaction.reply({
    content:
      'This feature is no longer available, let the staff member know you want to close the ticket.',
    flags: MessageFlags.Ephemeral,
  })
}
