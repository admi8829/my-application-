/**
 * Cloudflare Worker: Telegram Business Auto-Responder Bot with Gemini 3.6 Flash
 *
 * Target Platform: Cloudflare Workers (Free tier compatible, ES Modules format)
 * Required Secrets / Environment Variables:
 *  - TELEGRAM_BOT_TOKEN: Bot token from @BotFather
 *  - GEMINI_API_KEY: Google AI Studio Gemini API Key
 *  - ADMIN_CHAT_ID: Admin's private Telegram Chat / User ID for error alerts
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Webhook Setup Endpoint (/register or /setWebhook)
    if (url.pathname === '/register' || url.pathname === '/setWebhook') {
      return await handleSetWebhook(url.origin, env);
    }

    // 2. Incoming Telegram Update Webhook Receiver (HTTPS POST)
    if (request.method === 'POST') {
      try {
        const update = await request.json();
        await handleTelegramUpdate(update, env);
      } catch (err) {
        console.error('Unhandled Telegram Processing Error:', err);
        // Dispatch alert to Admin private chat on failure
        await sendAdminErrorAlert(err, env);
      }

      // CRITICAL: Always return HTTP 200 OK to Telegram to prevent infinite webhook retries
      return new Response('OK', { status: 200 });
    }

    // 3. Status Landing Page
    return new Response(
      `🤖 Telegram Business Auto-Responder Worker (Gemini 3.6 Flash)\n\n` +
      `Status: Live & Operational\n` +
      `Assistant Partner for: Habtamu Yifiru (@smart_x_help / Smart X Ethiopian)\n` +
      `Platform: Cloudflare Workers\n\n` +
      `• Webhook endpoint: POST ${url.origin}/\n` +
      `• Register webhook: GET ${url.origin}/register`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      }
    );
  }
};

/**
 * Handle incoming Telegram update payload
 */
async function handleTelegramUpdate(update, env) {
  // Extract business_message or standard message
  const message = update.business_message || update.message;

  if (!message || !message.text) {
    // Ignore non-text or empty updates gracefully
    return;
  }

  const chatId = message.chat?.id;
  const userText = message.text;
  const businessConnectionId = message.business_connection_id || update.business_connection_id;

  if (!chatId) return;

  // Step A: Send typing action via sendChatAction
  await sendTelegramChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing', businessConnectionId);

  // Step B: Call Gemini 3.6 Flash API with Habtamu Yifiru AI Assistant persona
  const aiResponse = await callGemini36Flash(userText, env.GEMINI_API_KEY);

  // Step C: Send AI response via sendMessage with Markdown formatting support
  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse, businessConnectionId);
}

/**
 * Call Gemini 3.6 Flash REST API via fetch()
 */
async function callGemini36Flash(userPrompt, apiKey) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

  const systemInstructionText =
    `You are an intelligent, human-like AI Assistant and Chat Automation Partner for Habtamu Yifiru (@smart_x_help / Habtamu Yifiru Official).\n\n` +
    `👤 ABOUT YOUR PRINCIPAL (Habtamu Yifiru):\n` +
    `- Identity: Habtamu Yifiru is a passionate Ethiopian Software Developer, Tech Entrepreneur, and Educational Content Creator.\n` +
    `- Projects & Focus: Creator of the "Smart x Ethiopian" educational platform (delivering national curriculum resources, STEM subjects, Grade 9-12 quizzes, and short notes built with Flutter/Supabase apps). He also creates YouTube & TikTok programming, mobile app development, and tech automation content.\n` +
    `- Tone & Ethos: Friendly, highly professional, innovative, culturally respectful, concise, and clear.\n\n` +
    `📜 KEY RESPONSE RULES:\n` +
    `1. CONTEXT & CHAT MEMORY AWARENESS:\n` +
    `   - Keep responses natural, direct, and non-repetitive.\n` +
    `   - Never repeat exact greetings or information if already acknowledged or provided.\n` +
    `2. PROACTIVE ENGAGEMENT:\n` +
    `   - Do not just be an answering machine. After giving a concise and helpful answer, always ask a relevant, guiding follow-up question to keep the conversation engaging.\n` +
    `3. TELEGRAM RICH TEXT FORMATTING:\n` +
    `   - Use Telegram Markdown intentionally for high visual hierarchy:\n` +
    `     • Use Bold (**text**) for key terms, headlines, or important names.\n` +
    `     • Use Italic (_text_) for polite side notes, emphasis, or short Amharic phrases.\n` +
    `     • Use Monospace (\`code\` or \`\`\`code block\`\`\`) for code snippets, IDs, tech terms, or commands.\n` +
    `     • Use bullet points (• or -) and clear section line breaks (---) to make messages scannable.\n` +
    `4. LANGUAGE & REPRESENTATION:\n` +
    `   - Respond fluently in Amharic (አማርኛ) or English, matching the user's language.\n` +
    `   - Speak politely on behalf of Habtamu / Smart X Team for business, collaboration, or support inquiries.`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ],
    systemInstruction: {
      parts: [
        {
          text: systemInstructionText
        }
      ]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000
    }
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!replyText) {
    throw new Error('Gemini API returned an empty or invalid candidate content.');
  }

  return replyText;
}

/**
 * Send Chat Action (e.g. typing) to Telegram
 */
async function sendTelegramChatAction(token, chatId, action = 'typing', businessConnectionId = null) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set.');

  const body = {
    chat_id: chatId,
    action: action
  };

  if (businessConnectionId) {
    body.business_connection_id = businessConnectionId;
  }

  await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

/**
 * Send Message to Telegram Chat
 */
async function sendTelegramMessage(token, chatId, text, businessConnectionId = null) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set.');

  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown'
  };

  if (businessConnectionId) {
    body.business_connection_id = businessConnectionId;
  }

  let res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  // Fallback to unparsed plain text if Markdown parsing fails in Telegram
  if (!res.ok) {
    delete body.parse_mode;
    res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Telegram sendMessage HTTP ${res.status}: ${errBody}`);
    }
  }
}

/**
 * Send private error alert message to Admin (ADMIN_CHAT_ID)
 */
async function sendAdminErrorAlert(error, env) {
  const adminId = env.ADMIN_CHAT_ID;
  const token = env.TELEGRAM_BOT_TOKEN;

  if (!adminId || !token) {
    console.warn('Unable to send alert: ADMIN_CHAT_ID or TELEGRAM_BOT_TOKEN is missing.');
    return;
  }

  const errorDetails = error?.stack || error?.message || String(error);
  const timestamp = new Date().toISOString();

  const alertMessage =
    `⚠️ **Telegram Bot Error Alert** ⚠️\n\n` +
    `**Time:** \`${timestamp}\`\n\n` +
    `**Error Details:**\n` +
    `\`\`\`\n${errorDetails.slice(0, 3000)}\n\`\`\``;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminId,
        text: alertMessage,
        parse_mode: 'Markdown'
      })
    });
  } catch (alertErr) {
    console.error('Failed to dispatch alert to Admin:', alertErr);
  }
}

/**
 * Register Webhook with Telegram API
 */
async function handleSetWebhook(originUrl, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return new Response('TELEGRAM_BOT_TOKEN missing in environment secrets.', { status: 400 });
  }

  const webhookUrl = `${originUrl}/`;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['message', 'business_message']
    })
  });

  const data = await res.json();
  return new Response(JSON.stringify(data, null, 2), {
    status: res.status,
    headers: { 'Content-Type': 'application/json' }
  });
}
