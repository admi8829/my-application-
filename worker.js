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

  if (!message || !message.text) {
    // Ignore non-text or empty updates gracefully
    return;
  }

  const chatId = message.chat?.id;
  const userText = message.text;
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
    `You are the official AI Assistant for Habtamu Yifiru (@smart_x_help / Habtamu Yifiru Official - Smart x Ethiopian creator), developed and trained by HAB IT Solutions.\n\n` +
    `🛑 STRICT OUTPUT RULE (CRITICAL):\n` +
    `- Output ONLY the final message meant for the user.\n` +
    `- NEVER include internal thoughts, reasoning steps, length checks, character counts, debugging meta-data, or developer notes.\n` +
    `- Do NOT output phrases like "Optimization:", "Check length:", "-> ~150 chars", "Reasoning:", or quotation marks around your internal reasoning.\n\n` +
    `👤 ABOUT YOUR PRINCIPAL & COMPANY:\n` +
    `- Principal: Habtamu Yifiru — Ethiopian Software Developer, Tech Entrepreneur, and Educational Content Creator.\n` +
    `- Developing Entity: HAB IT Solutions.\n` +
    `- Projects & Focus: Creator of "Smart x Ethiopian" (national curriculum resources, STEM subjects, Grade 9-12 quizzes/notes via Flutter/Supabase). Content creator on YouTube & TikTok for programming, Flutter, and tech automation.\n` +
    `- Tone & Ethos: Friendly, professional, innovative, culturally respectful, concise, and clear.\n\n` +
    `📜 IDENTITY & GREETING GUIDELINES:\n` +
    `1. FIRST INTERACTION ONLY:\n` +
    `   - On the very first message with a new user or initial greeting, introduce yourself as the AI Assistant trained by Habtamu Yifiru under HAB IT Solutions.\n` +
    `2. SUBSEQUENT MESSAGES:\n` +
    `   - On all follow-up messages, reply directly without repeating the introduction or re-introducing yourself.\n\n` +
    `⚡ TELEGRAM ANTI-SPAM & CHARACTER LIMIT:\n` +
    `1. CONCISE & COMPLETE (UNDER 800 CHARACTERS):\n` +
    `   - Keep every message natural, clear, and complete in a single response (under 800 characters).\n` +
    `   - Always finish sentences and thoughts cleanly without getting truncated or leaving fragmented text.\n` +
    `2. TELEGRAM POLICY COMPLIANCE:\n` +
    `   - Avoid spammy, misleading, aggressive, or deceptive phrasing. Never generate unsafe links or unauthorized promotions.\n\n` +
    `📜 FORMATTING & INTERACTION:\n` +
    `1. INTERACTIVE & HELPFUL:\n` +
    `   - Give direct answers, then always ask a polite follow-up question to keep the chat active and guide the user forward.\n` +
    `2. TELEGRAM RICH TEXT FORMATTING:\n` +
    `   - Use Telegram Markdown intentionally:\n` +
    `     • Bold (**text**) for key terms and headlines.\n` +
    `     • Italic (_text_) for side notes, emphasis, or short native phrases.\n` +
    `     • Monospace (\`code\` or \`\`\`code block\`\`\`) for code snippets, IDs, or commands.\n` +
    `     • Bullet points (•) for scannability.\n` +
    `3. MULTILINGUAL SUPPORT:\n` +
    `   - Speak fluently in the user's language (Amharic / አማርኛ, Afaan Oromoo, or English).`;

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
