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
      const userId = msg.author.id
      const avatar = msg.author.displayAvatarURL()

      let messageContent = escapeHtml(content)

      if (msg.embeds.length > 0) {
        messageContent += `<div style="margin-top: 8px; padding: 8px; background: #f0f0f0; border-left: 4px solid #5865f2; border-radius: 4px;">
          <strong>Embed:</strong><br/>
          ${msg.embeds.map((e) => escapeHtml(e.description || '')).join('<br/>')}
        </div>`
      }

      return `
        <div class="message">
          <div class="message-header">
            <img src="${avatar}" alt="${author}" class="message-avatar">
            <div class="message-info">
              <div class="message-author">${escapeHtml(author)} <span style="color: #7f8c8d; font-weight: normal;">(${userId})</span></div>
              <div class="message-time">${timestamp}</div>
            </div>
          </div>
          <div class="message-content">
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
  <title>top.gg Support Ticket - ${escapeHtml(thread.name)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #0f0f23;
      color: #e8e8e8;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: #1a1a2e;
    }
    .header {
      background: #1a1a2e;
      color: white;
      padding: 50px 40px;
      text-align: center;
      border-bottom: 2px solid #ff006e;
    }
    .header-logo {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 16px;
      color: #ff006e;
    }
    .header h1 {
      font-size: 36px;
      font-weight: 700;
      margin-bottom: 12px;
      color: #ffffff;
    }
    .header-subtitle {
      font-size: 16px;
      color: #ff006e;
      margin-bottom: 24px;
      font-weight: 500;
    }
    .header-meta {
      display: flex;
      justify-content: center;
      gap: 24px;
      font-size: 13px;
      color: #a8a8c0;
      flex-wrap: wrap;
    }
    .content {
      padding: 40px;
    }
    .message {
      margin-bottom: 20px;
      padding: 16px;
      border-radius: 8px;
      background: #252541;
      border-left: 3px solid #ff006e;
      transition: all 0.2s;
    }
    .message:hover {
      background: #2d2d4a;
      border-left-color: #ff4d94;
    }
    .message-header {
      display: flex;
      align-items: center;
      margin-bottom: 12px;
    }
    .message-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      margin-right: 12px;
      border: 2px solid #ff006e;
    }
    .message-info {
      flex: 1;
    }
    .message-author {
      font-weight: 600;
      color: #ffffff;
      font-size: 14px;
    }
    .message-author span {
      color: #a8a8c0;
      font-weight: normal;
    }
    .message-time {
      color: #7a7a8e;
      font-size: 12px;
      margin-top: 2px;
    }
    .message-content {
      color: #d8d8e8;
      line-height: 1.6;
      word-wrap: break-word;
      font-size: 14px;
    }
    .embed {
      margin-top: 12px;
      padding: 12px;
      background: #1a1a30;
      border-left: 3px solid #ff006e;
      border-radius: 4px;
      font-size: 13px;
      color: #b8b8c8;
    }
    .footer {
      background: linear-gradient(135deg, #1a1a2e 0%, #252541 100%);
      color: #ffffff;
      padding: 40px;
      text-align: center;
      font-size: 12px;
      line-height: 1.8;
      border-top: 2px solid #ff006e;
    }
    .footer-logo {
      font-weight: 700;
      margin-bottom: 12px;
      font-size: 16px;
      color: #ff006e;
    }
    .footer p {
      color: #a8a8c0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-logo">top.gg</div>
      <h1>Support Ticket Transcript</h1>
      <p class="header-subtitle">${escapeHtml(thread.name)}</p>
      <div class="header-meta">
        <span>📅 ${new Date().toLocaleDateString()}</span>
        <span>⏰ ${new Date().toLocaleTimeString()}</span>
      </div>
    </div>
    <div class="content">
      ${messagesHtml}
    </div>
    <div class="footer">
      <div class="footer-logo">top.gg Support</div>
      <p>This transcript contains the complete history of your support ticket.<br>It is confidential and intended solely for you and the top.gg support team.</p>
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
