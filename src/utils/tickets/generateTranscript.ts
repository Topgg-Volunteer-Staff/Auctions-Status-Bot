import { ThreadChannel } from 'discord.js'

export const generateTranscript = async (
  thread: ThreadChannel
): Promise<string> => {
  const messages = await thread.messages.fetch({ limit: 100 })
  const sortedMessages = Array.from(messages.values()).reverse()

  const messagesHtml = sortedMessages
    .map((msg) => {
      const timestamp = new Date(msg.createdTimestamp).toLocaleString()
      const content = msg.content || '*(No text content)*'
      const author = msg.author.username
      const avatar = msg.author.displayAvatarURL()

      let messageContent = escapeHtml(content)

      if (msg.embeds.length > 0) {
        messageContent += `<div style="margin-top: 8px; padding: 8px; background: #f0f0f0; border-left: 4px solid #5865f2; border-radius: 4px;">
          <strong>Embed:</strong><br/>
          ${msg.embeds.map((e) => escapeHtml(e.description || '')).join('<br/>')}
        </div>`
      }

      return `
        <div style="margin: 12px 0; padding: 12px; border-radius: 8px; background: #fafafa; border-left: 4px solid #5865f2;">
          <div style="display: flex; align-items: center; margin-bottom: 8px;">
            <img src="${avatar}" alt="${author}" style="width: 32px; height: 32px; border-radius: 50%; margin-right: 8px;">
            <div>
              <strong style="color: #2c3e50;">${escapeHtml(author)}</strong>
              <span style="color: #7f8c8d; font-size: 12px; margin-left: 8px;">${timestamp}</span>
            </div>
          </div>
          <div style="color: #2c3e50; line-height: 1.5;">
            ${messageContent}
          </div>
        </div>
      `
    })
    .join('')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket Transcript - ${escapeHtml(thread.name)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f5f5f5;
      margin: 0;
      padding: 20px;
      color: #2c3e50;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .header p {
      margin: 8px 0 0 0;
      opacity: 0.95;
      font-size: 14px;
    }
    .content {
      padding: 30px;
    }
    .message {
      margin: 12px 0;
      padding: 12px;
      border-radius: 8px;
      background: #fafafa;
      border-left: 4px solid #667eea;
    }
    .message-header {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }
    .message-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      margin-right: 8px;
    }
    .message-author {
      font-weight: 600;
      color: #2c3e50;
    }
    .message-time {
      color: #7f8c8d;
      font-size: 12px;
      margin-left: 8px;
    }
    .message-content {
      color: #2c3e50;
      line-height: 1.5;
      word-wrap: break-word;
    }
    .embed {
      margin-top: 8px;
      padding: 8px;
      background: #f0f0f0;
      border-left: 4px solid #667eea;
      border-radius: 4px;
      font-size: 13px;
    }
    .footer {
      background: #f9f9f9;
      padding: 20px 30px;
      text-align: center;
      border-top: 1px solid #e0e0e0;
      font-size: 12px;
      color: #7f8c8d;
    }
    @media (prefers-color-scheme: dark) {
      body {
        background: #2c3e50;
      }
      .container {
        background: #34495e;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      }
      .content {
        background: #34495e;
      }
      .message {
        background: #2c3e50;
        border-left-color: #667eea;
      }
      .message-author,
      .message-content {
        color: #ecf0f1;
      }
      .message-time {
        color: #95a5a6;
      }
      .footer {
        background: #2c3e50;
        border-top-color: #1a252f;
        color: #95a5a6;
      }
      .embed {
        background: #2c3e50;
        color: #ecf0f1;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Support Ticket Transcript</h1>
      <p><strong>${escapeHtml(thread.name)}</strong></p>
      <p style="font-size: 13px; margin: 12px 0 0 0;">Generated on ${new Date().toString()}</p>
    </div>
    <div class="content">
      ${messagesHtml}
    </div>
    <div class="footer">
      <p>This is a transcript of your support ticket. These messages are confidential and intended solely for the parties involved in this support request.</p>
    </div>
  </div>
</body>
</html>`

  return html
}

const escapeHtml = (text: string): string => {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (char) => map[char] || char)
}
