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
  <title>Top.gg Support Ticket - ${escapeHtml(thread.name)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f8f9fa;
      color: #1a1a1a;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
    }
    .header {
      background: linear-gradient(135deg, #5865f2 0%, #4752c4 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
      border-bottom: 4px solid #4752c4;
    }
    .header-logo {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 12px;
      letter-spacing: -0.5px;
    }
    .header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .header-subtitle {
      font-size: 14px;
      opacity: 0.9;
      margin-bottom: 20px;
    }
    .header-meta {
      display: flex;
      justify-content: center;
      gap: 20px;
      font-size: 12px;
      opacity: 0.85;
      flex-wrap: wrap;
    }
    .content {
      padding: 40px 30px;
    }
    .message {
      margin-bottom: 16px;
      padding: 16px;
      border-radius: 8px;
      background: #f8f9fa;
      border-left: 4px solid #5865f2;
      transition: background 0.2s;
    }
    .message:hover {
      background: #eff0f7;
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
      border: 2px solid #5865f2;
    }
    .message-info {
      flex: 1;
    }
    .message-author {
      font-weight: 600;
      color: #1a1a1a;
      font-size: 14px;
    }
    .message-time {
      color: #6c757d;
      font-size: 12px;
      margin-top: 2px;
    }
    .message-content {
      color: #2c3e50;
      line-height: 1.6;
      word-wrap: break-word;
      font-size: 14px;
    }
    .embed {
      margin-top: 12px;
      padding: 12px;
      background: #e9ecef;
      border-left: 4px solid #5865f2;
      border-radius: 4px;
      font-size: 13px;
      color: #495057;
    }
    .footer {
      background: #5865f2;
      color: white;
      padding: 30px;
      text-align: center;
      font-size: 12px;
      line-height: 1.6;
    }
    .footer-logo {
      font-weight: 700;
      margin-bottom: 10px;
      font-size: 14px;
    }
    @media (prefers-color-scheme: dark) {
      body {
        background: #1a1a1a;
      }
      .container {
        background: #2c2f33;
      }
      .content {
        background: #2c2f33;
      }
      .message {
        background: #36393f;
        border-left-color: #5865f2;
      }
      .message:hover {
        background: #3f4248;
      }
      .message-author {
        color: #ffffff;
      }
      .message-time {
        color: #72767d;
      }
      .message-content {
        color: #dcddde;
      }
      .embed {
        background: #2f3136;
        color: #b9bbbe;
      }
      .header-meta {
        opacity: 0.8;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-logo">🐟 top.gg</div>
      <h1>Support Ticket Transcript</h1>
      <p class="header-subtitle">${escapeHtml(thread.name)}</p>
      <div class="header-meta">
        <span>📅 Generated: ${new Date().toLocaleDateString()}</span>
        <span>⏰ ${new Date().toLocaleTimeString()}</span>
      </div>
    </div>
    <div class="content">
      ${messagesHtml}
    </div>
    <div class="footer">
      <div class="footer-logo">🐟 top.gg Support</div>
      <p>This transcript contains the complete history of your support ticket. It is confidential and intended solely for you and the top.gg support team.</p>
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
