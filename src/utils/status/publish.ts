import {
  Client,
  MessageCreateOptions,
  MessageFlags,
  TextChannel,
  TextDisplayBuilder,
} from 'discord.js'
import { channelIds, roleIds } from '../../globals'

export default async function publish(
  message: MessageCreateOptions,
  client: Client,
  ping: boolean,
  crosspost: boolean
): Promise<void> {
  const channel = client.channels.cache.get(
    channelIds.auctionsStatus
  ) as TextChannel

  const components = [...(message.components ?? [])]
  if (ping) {
    components.unshift(
      new TextDisplayBuilder().setContent(`<@&${roleIds.auctionsStatus}>`)
    )
  }

  const sent = await channel.send({
    ...message,
    components,
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: ping
      ? { parse: [], roles: [roleIds.auctionsStatus] }
      : { parse: [] },
  })

  if (crosspost) {
    await sent.crosspost()
  }
}
