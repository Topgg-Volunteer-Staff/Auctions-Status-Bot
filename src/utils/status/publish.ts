import { Client, MessageOptions, TextChannel } from 'discord.js'
import { announcementChannelId, pingRoleId } from '../../globals'

export default function publish(
  message: MessageOptions,
  client: Client,
  ping: boolean,
  crosspost: boolean
) {
  const channel = client.channels.cache.get(
    announcementChannelId
  ) as TextChannel
  if (ping) message.content = `<@&${pingRoleId}>`
  channel.send(message).then((msg) => {
    if (crosspost) msg.crosspost()
  })
}
