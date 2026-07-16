import { Telegraf, Markup } from 'telegraf';

// Global state in-memory (persists within the active Cloudflare isolation instance)
const registrations = [];
const userStates = {};
const admins = new Set();

export default {
  async fetch(request, env) {
    if (!env.TELEGRAM_BOT_TOKEN) {
      return new Response('Error: TELEGRAM_BOT_TOKEN is not set in secrets.', { status: 500 });
    }

    const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);
    const url = new URL(request.url);

    // 1. Webhook Register Endpoint (ይህንን አንዴ በብሮውዘር በመክፈት ቦቱን ከCloudflare ጋር ያገናኙታል)
    if (url.pathname === '/register') {
      try {
        const webhookUrl = `${url.origin}/webhook`;
        await bot.telegram.setWebhook(webhookUrl);
        return new Response(`Webhook successfully registered at: ${webhookUrl}`, { status: 200 });
      } catch (err) {
        return new Response(`Registration Failed: ${err.message}`, { status: 500 });
      }
    }

    // 2. Webhook Handler (ከTelegram የሚመጡ መልዕክቶች እዚህ ይስተናገዳሉ)
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        // --- Bot Logic ---

        // Helper to show the Admin Panel
        const showAdminPanel = (ctx) => {
          return ctx.reply(
            `🔑 *የአስተዳዳሪ መቆጣጠሪያ ሰሌዳ (Admin Panel)*\n\n` +
            `ያለዎት ፈቃድ፡ *አስተዳዳሪ (Administrator)*\n\n` +
            `አብረውት የሚሰሩትን ተግባራት ከታች ካሉት አማራጮች ይምረጡ፡`,
            {
              parse_mode: 'Markdown',
              protect_content: true,
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback('👥 የተመዘገቡ ተማሪዎች', 'admin_view_students'),
                  Markup.button.callback('📢 የጋራ መልዕክት', 'admin_broadcast_init')
                ],
                [
                  Markup.button.callback('📊 የቦት ሁኔታ', 'admin_view_stats'),
                  Markup.button.callback('🔓 ውጣ (Log Out)', 'admin_logout')
                ]
              ])
            }
          );
        };

        // /start ወይም መጀመሪያ ሲመጡ
        bot.start((ctx) => {
          return ctx.reply(
            `ሰላም ${ctx.from.first_name || 'ተማሪ'}! 👋 ወደ እውቀት የትምህርት ረዳት ቦት እንኳን ደህና መጡ።\n\n` +
            `እባክዎን ከታች ካሉት አማራጮች የሚፈልጉትን ይምረጡ፡`,
            {
              protect_content: true,
              ...Markup.keyboard([
                ['📝 መመዝገቢያ', '📚 የክፍል ትምህርቶች'],
                ['❓ የእለቱ ጥያቄ', 'ℹ️ መረጃ & እገዛ'],
                ['🤖 የ AI ረዳት', '🔑 የአስተዳዳሪ ክፍል']
              ]).resize()
            }
          );
        });

        // 📝 መመዝገቢያ ምርጫ
        bot.hears('📝 መመዝገቢያ', (ctx) => {
          const userId = ctx.from.id;
          userStates[userId] = { step: 'awaiting_name_grade' };
          return ctx.reply(
            `📝 *የተማሪ ምዝገባ*\n\n` +
            `እባክዎን ስምዎን እና ክፍልዎን ይላኩ።\n` +
            `ለምሳሌ፡ "አቤል በቀለ፣ 10B"`,
            {
              parse_mode: 'Markdown',
              protect_content: true
            }
          );
        });

        // 📚 የክፍል ትምህርቶች ምርጫ (Inline Buttons በመጠቀም)
        bot.hears('📚 የክፍል ትምህርቶች', (ctx) => {
          return ctx.reply(
            `📚 *የትምህርት አርዕስቶች*\n\n` +
            `ለመማር የሚፈልጉትን የትምህርት አይነት ይምረጡ፡`,
            {
              parse_mode: 'Markdown',
              protect_content: true,
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback('🔍 ሒሳብ (Maths)', 'edu_subject_math'),
                  Markup.button.callback('⚡ ፊዚክስ (Physics)', 'edu_subject_physics')
                ],
                [
                  Markup.button.callback('🧪 ኬሚስትሪ (Chemistry)', 'edu_subject_chem'),
                  Markup.button.callback('🧬 ባዮሎጂ (Biology)', 'edu_subject_bio')
                ]
              ])
            }
          );
        });

        // ❓ የእለቱ ጥያቄ ምርጫ
        bot.hears('❓ የእለቱ ጥያቄ', (ctx) => {
          return ctx.reply(
            `❓ *የዛሬው የክለሳ ጥያቄ*\n\n` +
            `ጥያቄ፡ ከሚከተሉት ውስጥ የውሃ (Water) ኬሚካላዊ ፎርሙላ የቱ ነው?\n\n` +
            `እባክዎን ትክክለኛውን ምርጫ ከታች ይጫኑ፡`,
            {
              parse_mode: 'Markdown',
              protect_content: true,
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback('A) CO2', 'quiz_ans_wrong_co2'),
                  Markup.button.callback('B) H2O', 'quiz_ans_correct_h2o'),
                  Markup.button.callback('C) NaCl', 'quiz_ans_wrong_nacl')
                ]
              ])
            }
          );
        });

        // 🤖 የ AI ረዳት ምርጫ
        bot.hears('🤖 የ AI ረዳት', (ctx) => {
          return ctx.reply(
            `🤖 *የ AI ረዳት (AI Assistant)*\n\n` +
            `ማንኛውንም ጥያቄ ለመጠየቅ ከፊት ለፊቱ "AI" ብለው ጽፈው ይላኩልኝ።\n` +
            `ለምሳሌ፡ "AI የፀሐይ ብርሃን ጥቅሞች ምንድን ናቸው?"\n\n` +
            `ወይም "AI 5 * 8 ስንት ነው?"`,
            {
              parse_mode: 'Markdown',
              protect_content: true
            }
          );
        });

        // የ AI ጥያቄ ሲላክ
        bot.hears(/^AI\s+(.+)$/i, async (ctx) => {
          const question = ctx.match[1];
          await ctx.reply('⏳ ከ Google Search መረጃ እየፈለግኩ ነው...', { protect_content: true });
          
          try {
            const { GoogleGenAI } = await import('@google/genai');
            if (!env.GEMINI_API_KEY) {
              return ctx.reply('⚠️ ይቅርታ፣ የ AI ረዳት በአሁን ሰዓት አይሰራም (GEMINI_API_KEY አልገባም)።');
            }

            const ai = new GoogleGenAI({ 
              apiKey: env.GEMINI_API_KEY,
              httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
            });
            const response = await ai.models.generateContent({
              model: 'gemini-3.5-flash',
              contents: question,
              config: {
                tools: [{ googleSearch: {} }],
                systemInstruction: 'You are a helpful educational AI assistant for students in Ethiopia. Always perform Google Search grounding to retrieve real-time, accurate facts. Summarize the facts clearly in Amharic. Be highly accurate, concise, and polite.',
              }
            });
            
            let replyText = `🤖 *የ AI መልስ:*\n\n${response.text}`;

            // ከ Google Search የተገኙ ምንጮችን ማውጣት እና ማሳየት
            const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
            if (chunks && chunks.length > 0) {
              const sourceUrls = [];
              for (const chunk of chunks) {
                if (chunk.web?.uri) {
                  const title = chunk.web.title || 'ዌብሳይት';
                  // በሊንክ መልክ ማስቀመጥ (Telegram Markdown ፎርማት)
                  sourceUrls.push(`• [${title}](${chunk.web.uri})`);
                }
              }
              if (sourceUrls.length > 0) {
                // እስከ 3 ዋና ዋና ምንጮችን ብቻ ያሳያል
                const uniqueSources = Array.from(new Set(sourceUrls)).slice(0, 3);
                replyText += `\n\n🌐 *ዋና ዋና የ Google መረጃ ምንጮች:*\n${uniqueSources.join('\n')}`;
              }
            }

            return ctx.reply(replyText, { parse_mode: 'Markdown', protect_content: true });
          } catch (error) {
            console.error('Gemini Error:', error);
            return ctx.reply('❌ ይቅርታ፣ አሁን ላይ ጥያቄዎን መመለስ አልቻልኩም። እባክዎ ቆየት ብለው ይሞክሩ።', { protect_content: true });
          }
        });

        // ℹ️ መረጃ & እገዛ ምርጫ
        bot.hears('ℹ️ መረጃ & እገዛ', (ctx) => {
          return ctx.reply(
            `ℹ️ *ስለ ቦቱ መረጃ*\n\n` +
            `ይህ ቦት ተማሪዎች ባሉበት ሆነው የተለያዩ የክፍል ትምህርቶችን፣ መልመጃዎችን እና ጥያቄዎችን እንዲለማመዱ የተዘጋጀ ነው።\n\n` +
            `📌 *ጠቃሚ መረጃዎች-*\n` +
            `• መረጃዎች እንዳይባክኑ Screenshot እና Forward ማድረግ ተከልክሏል።\n` +
            `• ማንኛውም ሀሳብ ካለዎት እባክዎ ዋና አስተዳዳሪውን ያነጋግሩ።`,
            {
              parse_mode: 'Markdown',
              protect_content: true
            }
          );
        });

        // የትምህርት ርዕስ ምርጫዎች Inline Callbacks
        bot.action('edu_subject_math', async (ctx) => {
          await ctx.answerCbQuery();
          return ctx.reply(
            `🔍 *ሒሳብ (Mathematics)*\n\n` +
            `• *ርዕስ 1:* የክፍልፋዮች አሰራር (Fractions)\n` +
            `• *ርዕስ 2:* አልጄብራ መግቢያ (Algebra)\n` +
            `• *ርዕስ 3:* ጂኦሜትሪ (Geometry)\n\n` +
            `📖 የትኛውን ማንበብ ይፈልጋሉ?`,
            {
              parse_mode: 'Markdown',
              protect_content: true,
              ...Markup.inlineKeyboard([
                [Markup.button.callback('ክፍልፋዮችን ጀምር', 'read_coming_soon')],
                [Markup.button.callback('↩️ ወደ ኋላ ተመለስ', 'go_back_subjects')]
              ])
            }
          );
        });

        bot.action('edu_subject_physics', async (ctx) => {
          await ctx.answerCbQuery();
          return ctx.reply(
            `⚡ *ፊዚክስ (Physics)*\n\n` +
            `• *ርዕስ 1:* ኒውተን ህጎች (Newton's Laws)\n` +
            `• *ርዕስ 2:* ጉልበት እና ስራ (Force & Work)\n` +
            `• *ርዕስ 3:* ኤሌክትሪክ (Electricity)\n\n` +
            `📖 ትምህርቱን ለመጀመር ከታች ያለውን ይጫኑ፡`,
            {
              parse_mode: 'Markdown',
              protect_content: true,
              ...Markup.inlineKeyboard([
                [Markup.button.callback('ትምህርቱን ጀምር', 'read_coming_soon')],
                [Markup.button.callback('↩️ ወደ ኋላ ተመለስ', 'go_back_subjects')]
              ])
            }
          );
        });

        bot.action('edu_subject_chem', async (ctx) => {
          await ctx.answerCbQuery();
          return ctx.reply(
            `🧪 *ኬሚስትሪ (Chemistry)*\n\n` +
            `• *ርዕስ 1:* አቶሞች እና ሞለኪውሎች\n` +
            `• *ርዕስ 2:* የአሲድ እና ቤዝ ፀባያት\n` +
            `• *ርዕስ 3:* ኬሚካላዊ ውህዶች\n\n` +
            `📖 ትምህርቱን ለመጀመር ከታች ያለውን ይጫኑ፡`,
            {
              parse_mode: 'Markdown',
              protect_content: true,
              ...Markup.inlineKeyboard([
                [Markup.button.callback('ውህዶችን ጀምር', 'read_coming_soon')],
                [Markup.button.callback('↩️ ወደ ኋላ ተመለስ', 'go_back_subjects')]
              ])
            }
          );
        });

        bot.action('edu_subject_bio', async (ctx) => {
          await ctx.answerCbQuery();
          return ctx.reply(
            `🧬 *ባዮሎጂ (Biology)*\n\n` +
            `• *ርዕስ 1:* የህዋስ አወቃቀር (Cells)\n` +
            `• *ርዕስ 2:* የስነ-ህይወት ስርአት (Ecosystems)\n` +
            `• *ርዕስ 3:* የሰውነት ክፍሎች (Human Anatomy)\n\n` +
            `📖 ትምህርቱን ለመጀመር ከታች ያለውን ይጫኑ፡`,
            {
              parse_mode: 'Markdown',
              protect_content: true,
              ...Markup.inlineKeyboard([
                [Markup.button.callback('ህዋሳትን ጀምር', 'read_coming_soon')],
                [Markup.button.callback('↩️ ወደ ኋላ ተመለስ', 'go_back_subjects')]
              ])
            }
          );
        });

        bot.action('go_back_subjects', async (ctx) => {
          await ctx.answerCbQuery();
          return ctx.editMessageText(
            `📚 *የትምህርት አርዕስቶች*\n\n` +
            `ለመማር የሚፈልጉትን የትምህርት አይነት ይምረጡ፡`,
            {
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback('🔍 ሒሳብ (Maths)', 'edu_subject_math'),
                  Markup.button.callback('⚡ ፊዚክስ (Physics)', 'edu_subject_physics')
                ],
                [
                  Markup.button.callback('🧪 ኬሚስትሪ (Chemistry)', 'edu_subject_chem'),
                  Markup.button.callback('🧬 ባዮሎጂ (Biology)', 'edu_subject_bio')
                ]
              ])
            }
          );
        });

        bot.action('read_coming_soon', async (ctx) => {
          await ctx.answerCbQuery('ትምህርቱ በቅርቡ ይጫናል! ⏳', { show_alert: true });
        });

        // የጥያቄ ውጤት Callbacks
        bot.action('quiz_ans_correct_h2o', async (ctx) => {
          await ctx.answerCbQuery('ትክክለኛ መልስ ነው! 🎉', { show_alert: true });
          return ctx.editMessageText(
            `🎉 *ትክክለኛ መልስ አግኝተዋል!*\n\n` +
            `ውሃ (Water) ኬሚካላዊ ፎርሙላው *H2O* ነው።\n` +
            `ይቀጥሉ፣ ምርጥ ጥረት ነው! 💪`,
            { parse_mode: 'Markdown' }
          );
        });

        bot.action(/quiz_ans_wrong_(.+)/, async (ctx) => {
          await ctx.answerCbQuery('የተሳሳተ መልስ! ❌', { show_alert: true });
          return ctx.editMessageText(
            `❌ *መልሱ የተሳሳተ ነው!*\n\n` +
            `የውሃ (Water) ትክክለኛ ኬሚካላዊ ፎርሙላ *H2O* ነው።\n` +
            `ለቀጣይ ጥያቄ ይዘጋጁ! 📚`,
            { parse_mode: 'Markdown' }
          );
        });

        // --- 🔑 የአስተዳዳሪ ክፍሎች (Admin Listeners) ---

        bot.hears('🔑 የአስተዳዳሪ ክፍል', async (ctx) => {
          const userId = ctx.from.id;
          const isDirectAdmin = env.ADMIN_TELEGRAM_ID && String(userId) === String(env.ADMIN_TELEGRAM_ID);
          const isSessionAdmin = admins.has(userId);

          if (isDirectAdmin || isSessionAdmin) {
            return showAdminPanel(ctx);
          } else {
            userStates[userId] = { step: 'awaiting_admin_password' };
            return ctx.reply(
              `🔑 *የአስተዳዳሪ መግቢያ*\n\n` +
              `ወደ ሚስጥራዊው አስተዳዳሪ ክፍል ለመግባት እባክዎ የይለፍ ቃል (Password) ይጻፉ፡`,
              { parse_mode: 'Markdown', protect_content: true }
            );
          }
        });

        bot.command('admin', async (ctx) => {
          const userId = ctx.from.id;
          const isDirectAdmin = env.ADMIN_TELEGRAM_ID && String(userId) === String(env.ADMIN_TELEGRAM_ID);
          const isSessionAdmin = admins.has(userId);

          if (isDirectAdmin || isSessionAdmin) {
            return showAdminPanel(ctx);
          } else {
            userStates[userId] = { step: 'awaiting_admin_password' };
            return ctx.reply(
              `🔑 *የአስተዳዳሪ መግቢያ*\n\n` +
              `ወደ ሚስጥራዊው አስተዳዳሪ ክፍል ለመግባት እባክዎ የይለፍ ቃል (Password) ይጻፉ፡`,
              { parse_mode: 'Markdown', protect_content: true }
            );
          }
        });

        // የአስተዳዳሪ Callback Actions
        bot.action('admin_view_students', async (ctx) => {
          await ctx.answerCbQuery();
          const userId = ctx.from.id;
          const isAuthorized = admins.has(userId) || String(userId) === String(env.ADMIN_TELEGRAM_ID);
          if (!isAuthorized) return ctx.reply('❌ ፈቃድ የለዎትም!');

          if (registrations.length === 0) {
            return ctx.reply(
              `👥 *የተመዘገቡ ተማሪዎች ዝርዝር*\n\n` +
              `በአሁን ሰዓት ምንም የተመዘገበ ተማሪ የለም! 📭\n` +
              `_(ማሳሰቢያ: ተማሪዎች ሲመዘገቡ እዚህ ይታያሉ)_`,
              {
                parse_mode: 'Markdown',
                protect_content: true,
                ...Markup.inlineKeyboard([[Markup.button.callback('↩️ ወደ መቆጣጠሪያ ሰሌዳ', 'admin_go_back')]])
              }
            );
          }

          let studentListText = `👥 *የተመዘገቡ ተማሪዎች ዝርዝር (${registrations.length})*\n\n`;
          registrations.forEach((student, index) => {
            const username = student.username ? `@${student.username}` : 'ያልተገባ';
            studentListText += `${index + 1}. *${student.first_name || 'ተማሪ'}* (${username})\n` +
                               `   • መረጃ፡ \`${student.info}\`\n` +
                               `   • ጾታ፡ ${student.gender}\n` +
                               `   • ይመዘገብበት ሰዓት፡ ${student.date}\n\n`;
          });

          return ctx.reply(
            studentListText,
            {
              parse_mode: 'Markdown',
              protect_content: true,
              ...Markup.inlineKeyboard([[Markup.button.callback('↩️ ወደ መቆጣጠሪያ ሰሌዳ', 'admin_go_back')]])
            }
          );
        });

        bot.action('admin_broadcast_init', async (ctx) => {
          await ctx.answerCbQuery();
          const userId = ctx.from.id;
          const isAuthorized = admins.has(userId) || String(userId) === String(env.ADMIN_TELEGRAM_ID);
          if (!isAuthorized) return ctx.reply('❌ ፈቃድ የለዎትም!');

          userStates[userId] = { step: 'awaiting_broadcast' };
          return ctx.reply(
            `📢 *የጋራ መልዕክት መላኪያ (Broadcast)*\n\n` +
            `እባክዎን ለሁሉም ተማሪዎች ማስተላለፍ የሚፈልጉትን መልዕክት እዚህ ይጻፉልኝ።\n` +
            `መልዕክቱ እያንዳንዱ ተማሪ ጋር ይደርሳል።`,
            { parse_mode: 'Markdown', protect_content: true }
          );
        });

        bot.action('admin_view_stats', async (ctx) => {
          await ctx.answerCbQuery();
          const userId = ctx.from.id;
          const isAuthorized = admins.has(userId) || String(userId) === String(env.ADMIN_TELEGRAM_ID);
          if (!isAuthorized) return ctx.reply('❌ ፈቃድ የለዎትም!');

          const tokenStatus = env.TELEGRAM_BOT_TOKEN ? '✅ Active' : '❌ Inactive';
          const geminiStatus = env.GEMINI_API_KEY ? '✅ Active' : '❌ Inactive';

          return ctx.reply(
            `📊 *የቦቱ አጠቃላይ ሁኔታ (Bot Live System Status)*\n\n` +
            `• *የተመዘገቡ ተማሪዎች:* \`${registrations.length}\` ተማሪዎች\n` +
            `• *Telegram Token:* ${tokenStatus}\n` +
            `• *Google Gemini API:* ${geminiStatus}\n` +
            `• *የመትከያ መድረክ (Engine):* Cloudflare Workers\n` +
            `• *የደህንነት ሁኔታ:* Screenshot & Forward Protected 🔥\n\n` +
            `💡 _እነዚህ መረጃዎች በየሰከንዱ የሚደሱ የቀጥታ ሁኔታ ማሳያዎች ናቸው።_`,
            {
              parse_mode: 'Markdown',
              protect_content: true,
              ...Markup.inlineKeyboard([[Markup.button.callback('↩️ ወደ መቆጣጠሪያ ሰሌዳ', 'admin_go_back')]])
            }
          );
        });

        bot.action('admin_logout', async (ctx) => {
          await ctx.answerCbQuery('ለቀው ወጥተዋል!');
          admins.delete(ctx.from.id);
          return ctx.editMessageText('✅ ከአስተዳዳሪው መቆጣጠሪያ ሰሌዳ ወጥተዋል። ደህንነትዎ የተጠበቀ ነው!');
        });

        bot.action('admin_go_back', async (ctx) => {
          await ctx.answerCbQuery();
          try {
            await ctx.deleteMessage();
          } catch(e) {}
          return showAdminPanel(ctx);
        });

        // --- ✍️ የጽሑፍ እና መመዝገቢያ ማስተናገጃ (Main Message Handler) ---

        bot.on('text', async (ctx) => {
          const text = ctx.message.text;
          if (text.startsWith('/')) return;

          const userId = ctx.from.id;
          const state = userStates[userId];

          // 1. መመዝገቢያ ሎጂክ
          if (state && state.step === 'awaiting_name_grade') {
            userStates[userId] = { step: 'awaiting_gender', info: text };
            return ctx.reply(
              `✍️ *ተቀብያለሁ!*\n\n` +
              `ያስተላለፉት መረጃ፡ "${text}"\n\n` +
              `አሁን ደግሞ እባክዎን ጾታዎን ከታች ይምረጡ፡`,
              {
                protect_content: true,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                  [
                    Markup.button.callback('👨 ወንድ (Male)', 'sex_male'),
                    Markup.button.callback('👩 ሴት (Female)', 'sex_female')
                  ]
                ])
              }
            );
          }

          // 2. የአስተዳዳሪ የይለፍ ቃል ማስገቢያ ሎጂክ (Awaiting Password)
          if (state && state.step === 'awaiting_admin_password') {
            const adminPass = env.ADMIN_PASSWORD || 'admin123';
            if (text === adminPass) {
              admins.add(userId);
              delete userStates[userId];
              return showAdminPanel(ctx);
            } else {
              delete userStates[userId];
              return ctx.reply('❌ የተሳሳተ የይለፍ ቃል! የአስተዳዳሪው ክፍል ተቆልፏል።');
            }
          }

          // 3. የአስተዳዳሪ የጋራ መልዕክት ሎጂክ (Awaiting Broadcast Message)
          if (state && state.step === 'awaiting_broadcast') {
            const isAuthorized = admins.has(userId) || String(userId) === String(env.ADMIN_TELEGRAM_ID);
            if (!isAuthorized) {
              delete userStates[userId];
              return ctx.reply('❌ መብት የለዎትም!');
            }

            delete userStates[userId];
            const broadcastMsg = text;
            await ctx.reply('⏳ መልዕክቱ ለሁሉም ተማሪዎች በመላክ ላይ ነው...', { protect_content: true });

            // ከተመዘገቡት ተማሪዎች ልዩ የሆኑ Chat IDዎችን ወስደን ማስተላለፍ
            const targetIds = Array.from(new Set(registrations.map(r => r.id)));
            // መላኪያው እንዲሞከር በራሱ ለአስተዳዳሪውም መላክ
            if (!targetIds.includes(userId)) targetIds.push(userId);

            let successCount = 0;
            let failCount = 0;

            for (const targetId of targetIds) {
              try {
                await ctx.telegram.sendMessage(targetId, 
                  `📢 *ከአስተዳዳሪው የተላለፈ የጋራ መልዕክት*\n\n${broadcastMsg}`, 
                  { parse_mode: 'Markdown', protect_content: true }
                );
                successCount++;
              } catch (err) {
                console.error(`Failed to send to ${targetId}:`, err);
                failCount++;
              }
            }

            return ctx.reply(
              `✅ *የጋራ መልዕክት ማስተላለፉ ተጠናቋል!*\n\n` +
              `• በተሳካ ሁኔታ የተላከላቸው፡ *${successCount}*\n` +
              `• ያልተላከላቸው (ያገዱ ወይም ስህተት)፡ *${failCount}*`,
              { parse_mode: 'Markdown' }
            );
          }

          // ማንኛውም ሌላ ጥያቄ ሲመጣ ጥቆማ መስጠት
          return ctx.reply(
            `❓ ማስገባት የፈለጉትን መረጃ መለየት አልቻልኩም።\n\n` +
            `• ለመመዝገብ ከታች '📝 መመዝገቢያ' የሚለውን ይጫኑ።\n` +
            `• ጥያቄ ለመጠየቅ 'AI' ብለው መልዕክት ይጀምሩ (ለምሳሌ: AI ጤና ምንድን ነው?)`
          );
        });

        // ጾታ ሲመረጥ
        bot.action(/sex_(.+)/, async (ctx) => {
          const gender = ctx.match[1] === 'male' ? 'ወንድ' : 'ሴት';
          await ctx.answerCbQuery();
          
          const userId = ctx.from.id;
          const info = userStates[userId]?.info || 'ያልታወቀ ተማሪ';

          // አስቀምጥ
          registrations.push({
            id: userId,
            first_name: ctx.from.first_name || '',
            username: ctx.from.username || '',
            info: info,
            gender: gender,
            date: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          });

          // state አጽዳ
          delete userStates[userId];

          return ctx.editMessageText(
            `✅ *ምዝገባው በተሳካ ሁኔታ ተጠናቋል!*\n\n` +
            `📝 *የተማሪ መረጃ:*\n` +
            `• ስምና ክፍል፡ *${info}*\n` +
            `• ጾታ፡ *${gender}*\n\n` +
            `ትምህርቶችን ለመጀመር ከስር ባለው ኪቦርድ '📚 የክፍል ትምህርቶች' የሚለውን ይጫኑ። 🚀`,
            { parse_mode: 'Markdown' }
          );
        });

        // ------------------------------------

        const update = await request.json();
        await bot.handleUpdate(update);
        return new Response('OK', { status: 200 });
      } catch (err) {
        console.error('Update Error:', err);
        return new Response('OK', { status: 200 }); // Telegram tries again if not 200
      }
    }

    // Dashboard page (for display/health checks only)
    return new Response('Telegram Bot Worker is Live. Path: /webhook', { status: 200 });
  },
};
