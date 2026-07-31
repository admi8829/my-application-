/**
 * Cloudflare Worker: Telegram Business Auto-Responder Bot with Gemini API & Multi-Model Fallback
 *
 * Principal: Habtamu Yifiru (@smart_x_help / Habtamu Yifiru Official - Smart x Ethiopian)
 * Target Platform: Cloudflare Workers (ES Modules format)
 *
 * Environment Variables / Secrets Required in Cloudflare Worker Dashboard:
 *  - TELEGRAM_BOT_TOKEN : Bot token from @BotFather
 *  - GEMINI_API_KEY     : Google AI Studio Gemini API Key
 *  - ADMIN_CHAT_ID      : Admin's private Telegram User/Chat ID for error alerts
 */

// Fallback sequence of Gemini models in order of preference
const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3-flash'
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Webhook Setup Endpoint (/register or /setWebhook)
    if (url.pathname === '/register' || url.pathname === '/setWebhook') {
      return await handleSetWebhook(url.origin, env);
    }

    // 2. Incoming Telegram Update Receiver (HTTPS POST)
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

    // 3. Status & Health Landing Page
    return new Response(
      `🤖 Telegram Business Auto-Responder Worker (Gemini Multi-Model Fallback)\n\n` +
      `Status: Live & Operational\n` +
      `Assistant Partner for: Habtamu Yifiru (@smart_x_help / Smart X Ethiopian)\n` +
      `Platform: Cloudflare Workers\n\n` +
      `• Active Models: ${GEMINI_MODELS.join(', ')}\n` +
      `• Webhook Receiver Endpoint: POST ${url.origin}/\n` +
      `• Register Webhook Endpoint: GET ${url.origin}/register`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      }
    );
  }
};

/**
 * Main Handler for Telegram Updates (business_message or standard message)
 */
async function handleTelegramUpdate(update, env) {
  // Extract business_message or standard message
  const message = update.business_message || update.message;

  if (!message) return;

  // Extract text content from message text, media captions, stickers, or voice/audio notes
  let userText = message.text || message.caption;

  if (!userText && message.sticker) {
    const stickerEmoji = message.sticker.emoji || '😊';
    userText = `[User sent a sticker ${stickerEmoji}]`;
  } else if (!userText && (message.voice || message.audio)) {
    userText = `[User sent a voice or audio note]`;
  }

  if (!userText) {
    // Ignore updates without text/caption/sticker/voice content
    return;
  }

  const chatId = message.chat?.id;
  const businessConnectionId = message.business_connection_id || update.business_connection_id;

  if (!chatId) return;

  // Step 1: Send typing status indicator to Telegram
  await sendTelegramChatAction(env.TELEGRAM_BOT_TOKEN, chatId, 'typing', businessConnectionId);

  // Step 2: Call Gemini API with Multi-Model Fallback & Auto-Retry
  const aiResponse = await callGeminiWithFallback(userText, env.GEMINI_API_KEY);

  // Step 3: Send AI reply back to user with Markdown formatting (and plain-text fallback)
  await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, chatId, aiResponse, businessConnectionId);
}

/**
 * Call Gemini API using a Multi-Model Fallback system with Automatic Retry logic
 */
async function callGeminiWithFallback(userPrompt, apiKey) {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }

  const systemInstructionText =
    `You are the elite personal assistant for Habtamu Yifiru / HAB IT Solutions. You handle customer inquiries, technical questions, and general conversations on his behalf.\n\n` +
    `🛑 CRITICAL STRICT RULES:\n` +
    `1. NO REPETITIVE INTRODUCTIONS: NEVER say "I am an AI", "እኔ AI ነኝ", or "በ HAB IT Solutions የበለፀግኩት...". Do NOT introduce yourself or state your role unless the user explicitly asks "Who are you?".\n` +
    `2. ABSOLUTE CONCISE RESPONSES: Keep every response extremely short, clean, direct, and decorated with tasteful emojis 😊. Maximum 2-4 lines per response. No giant essays or mechanical bullet lists unless requested.\n` +
    `3. CHAT HISTORY CONTINUITY: Always read and respect the previous conversation history. If the user replies with short words like "እሺ", "አረ", "አዎ", respond naturally in context without resetting or re-greeting.\n\n` +
    `🎙️ MULTI-FORMAT & MEDIA UNDERSTANDING:\n` +
    `1. VOICE & AUDIO MESSAGES: When processing voice or audio notes from users, focus on the core user intent and provide a concise, friendly text response.\n` +
    `2. STICKERS & EMOJIS: Recognize sticker intent and inline emojis (greetings, appreciation, humor, frustration). Respond naturally with matching tone and appropriate emojis 😊.\n` +
    `3. RICH TEXT STYLES: Correctly interpret formatting styles sent by the user (Bold, Italic, Monospace/Code, Spoilers) and adapt your output formatting cleanly.\n\n` +
    `🧠 TONE & PERSONALITY (HUMAN-LIKE):\n` +
    `- Speak warmly, politely, and casually like a real professional human assistant.\n` +
    `- Match the user's language seamlessly (Amharic / አማርኛ, Afaan Oromoo, or English).\n` +
    `- Always end with a polite, natural follow-up question to keep the chat active.\n\n` +
    `📞 OFFICIAL CONTACT & BRAND DETAILS:\n` +
    `Only share contact information when requested or relevant:\n` +
    `- Telegram Username: @smart_x_help (Always write with the underscore)\n` +
    `- Phone Number: 0992480372\n` +
    `- YouTube Channel: https://www.youtube.com/@smartx.ethiopia\n` +
    `- Project Mention: Smart x Ethiopian (Educational Platform for High School STEM, Quizzes & Short Notes).\n\n` +
    `🛑 OUTPUT FORMATTING CLEANLINESS:\n` +
    `- Output ONLY the final raw chat text meant for the user.\n` +
    `- NEVER output debug logs, character counts, internal reasoning (e.g. "Optimization:"), or wrapping quotation marks.`;

  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }]
      }
    ],
    systemInstruction: {
      parts: [{ text: systemInstructionText }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000
    }
  };

  const modelErrors = [];

  // Iterate through the fallback list of Gemini models
  for (const modelName of GEMINI_MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    // Retry loop for transient errors (e.g., 503 Service Unavailable or 429 Rate Limit)
    const MAX_RETRIES = 2;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[Gemini Retry] Retrying ${modelName} (Attempt ${attempt + 1}/${MAX_RETRIES + 1})...`);
          // 1.5 second delay before retry
          await new Promise((resolve) => setTimeout(resolve, 1500));
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        // If 503 (Server Busy) or 429 (Rate Limit) and retries remain, retry this model
        if ((response.status === 503 || response.status === 429) && attempt < MAX_RETRIES) {
          console.warn(`[Gemini ${modelName}] HTTP ${response.status}. Retrying...`);
          continue;
        }

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`HTTP ${response.status}: ${errBody}`);
        }

        const data = await response.json();
        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!replyText) {
          throw new Error('Returned empty or invalid candidate content.');
        }

        console.log(`[Gemini Success] Successfully generated response using model: ${modelName}`);
        return replyText; // Success! Return response and exit function
      } catch (err) {
        console.warn(`[Gemini Attempt Failed] Model ${modelName} (Attempt ${attempt + 1}): ${err.message}`);

        // If it's the last retry for this model, log error to modelErrors and break to next model
        if (attempt === MAX_RETRIES) {
          modelErrors.push(`${modelName}: ${err.message}`);
        }
      }
    }
  }

  // If all fallback models failed
  throw new Error(`All Gemini Fallback Models Failed:\n${modelErrors.join('\n')}`);
}

/**
 * Send Chat Action (e.g. typing) to Telegram
 */
async function sendTelegramChatAction(token, chatId, action = 'typing', businessConnectionId = null) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN environment variable is missing.');

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
 * Send Message to Telegram Chat with Markdown support and Plain-Text fallback
 */
async function sendTelegramMessage(token, chatId, text, businessConnectionId = null) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN environment variable is missing.');

  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown'
  };

  if (businessConnectionId) {
    body.business_connection_id = businessConnectionId;
  }

  // Primary Attempt: Send with Markdown formatting
  let res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  // Fallback: If Markdown parsing fails on Telegram's side, resend as plain text
  if (!res.ok) {
    console.warn('Telegram Markdown parse failed. Falling back to plain text sending...');
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
 * Dispatch Private Error Alert Message to Admin (ADMIN_CHAT_ID)
 */
async function sendAdminErrorAlert(error, env) {
  const adminId = env.ADMIN_CHAT_ID;
  const token = env.TELEGRAM_BOT_TOKEN;

  if (!adminId || !token) {
    console.warn('Cannot dispatch error alert: ADMIN_CHAT_ID or TELEGRAM_BOT_TOKEN is not configured.');
    return;
  }

  const errorDetails = error?.stack || error?.message || String(error);
  const timestamp = new Date().toISOString();

  const alertMessage =
    `⚠️ **Telegram Bot Error Alert** ⚠️\n\n` +
    `**Timestamp:** \`${timestamp}\`\n\n` +
    `**Error Stack / Message:**\n` +
    `\`\`\`\n${errorDetails.slice(0, 3000)}\n\`\`\``;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminId,
        text: alertMessage,
        parse_mode: 'Markdown'
      })
    });

    if (!res.ok) {
      // Fallback to plain text if Markdown formatting fails for alert
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: adminId,
          text: `⚠️ Telegram Bot Error Alert ⚠️\n\nTimestamp: ${timestamp}\n\nError:\n${errorDetails.slice(0, 3000)}`
        })
      });
    }
  } catch (alertErr) {
    console.error('Failed to dispatch alert message to Admin:', alertErr);
  }
}

/**
 * Register Webhook Endpoint with Telegram API
 */
async function handleSetWebhook(originUrl, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return new Response('Error: TELEGRAM_BOT_TOKEN is missing in environment secrets.', { status: 400 });
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
