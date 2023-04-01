import { Client, BaseMessageOptions, TextChannel } from 'discord.js'
import { channelIds, roleIds } from '../../globals'

export default function publish(
  message: BaseMessageOptions,
  client: Client,
  ping: boolean,
  crosspost: boolean
) {
  const channel = client.channels.cache.get(
    channelIds.auctionsStatus
  ) as TextChannel
  if (ping) message.content = `<@&${roleIds.auctionsStatus}>`
  channel.send(message).then((msg) => {
    if (crosspost) msg.crosspost()
  })
}
