import { ContainerBuilder, MessageFlags, TextDisplayBuilder } from 'discord.js'
import { emoji } from './emojis'

export interface TextPanelOptions {
  accentColor: number
  description: string
  title?: string
}

export const COMPONENTS_V2_FLAGS = MessageFlags.IsComponentsV2

export const COMPONENTS_V2_EPHEMERAL_FLAGS =
  MessageFlags.Ephemeral | MessageFlags.IsComponentsV2

const splitTextDisplayContent = (content: string): Array<string> => {
  const chunks: Array<string> = []
  let remaining = content

  while (remaining.length > 4_000) {
    const newlineIndex = remaining.lastIndexOf('\n', 4_000)
    const splitIndex = newlineIndex > 2_000 ? newlineIndex : 4_000
    chunks.push(remaining.slice(0, splitIndex))
    remaining = remaining.slice(splitIndex).replace(/^\n/, '')
  }

  if (remaining) chunks.push(remaining)
  return chunks
}

export const createTextPanel = ({
  accentColor,
  description,
  title,
}: TextPanelOptions): ContainerBuilder => {
  const textBlocks = [
    ...(title ? [`## ${title}`] : []),
    ...splitTextDisplayContent(description),
  ]

  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      textBlocks.map((content) => new TextDisplayBuilder().setContent(content))
    )
}

export const createErrorPanel = (
  title: string,
  description?: string
): ContainerBuilder =>
  createTextPanel({
    accentColor: 0xff3366,
    title: `${emoji.error} ${title}`,
    description: description ?? '',
  })

export const createSuccessPanel = (
  title: string,
  description?: string
): ContainerBuilder =>
  createTextPanel({
    accentColor: 0x00cc88,
    title: `${emoji.online} ${title}`,
    description: description ?? '',
  })

export const createInfoPanel = (message?: string): ContainerBuilder =>
  createTextPanel({
    accentColor: 0x00bbff,
    description: `${emoji.blueinfo} ${message ?? ''}`,
  })

export const createLoadingPanel = (): ContainerBuilder =>
  createTextPanel({
    accentColor: 0x00bbff,
    description: '<a:loading:1536805796741120182> loading...',
  })
