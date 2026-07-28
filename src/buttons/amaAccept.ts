import {
  ButtonInteraction,
  Client,
  ComponentType,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js'

export const button = {
  name: 'amaAccept',
}

const getTextDisplayContent = (component: unknown): Array<string> => {
  if (typeof component !== 'object' || component === null) return []

  const data = component as {
    components?: unknown
    content?: unknown
    type?: unknown
  }

  if (
    data.type === ComponentType.TextDisplay &&
    typeof data.content === 'string'
  ) {
    return [data.content]
  }

  if (!Array.isArray(data.components)) return []
  return data.components.flatMap((child) => getTextDisplayContent(child))
}

export const execute = async (
  _client: Client,
  interaction: ButtonInteraction
): Promise<void> => {
  const message = interaction.message
  const legacyEmbed = message.embeds[0]
  const existingText = message.components.flatMap((component) =>
    getTextDisplayContent(component.toJSON())
  )

  if (legacyEmbed) {
    if (legacyEmbed.title) existingText.push(`## ${legacyEmbed.title}`)
    if (legacyEmbed.description) existingText.push(legacyEmbed.description)
    existingText.push(
      ...legacyEmbed.fields.map((field) => `**${field.name}**\n${field.value}`)
    )
  }

  if (existingText.length === 0) {
    await interaction.reply({
      content: 'Embed not found.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const approvedPanel = new ContainerBuilder().setAccentColor(0x00ff00)
  for (const content of existingText) {
    approvedPanel.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content)
    )
  }
  approvedPanel.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `**Approved by**\n<@${interaction.user.id}>`
    )
  )

  if (legacyEmbed) {
    await message.edit({
      content: null,
      embeds: [],
      components: [approvedPanel],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    })
  } else {
    await message.edit({
      components: [approvedPanel],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    })
  }

  await interaction.reply({
    content: '✅ Question approved!',
    flags: MessageFlags.Ephemeral,
  })
}
