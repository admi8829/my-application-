import { Telegraf, Markup } from 'telegraf';

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

        // /start ወይም መጀመሪያ ሲመጡ
        bot.start((ctx) => {
          return ctx.reply(
            `ሰላም ${ctx.from.first_name || 'ተማሪ'}! 👋 ወደ እውቀት የትምህርት ረዳት ቦት እንኳን ደህና መጡ።\n\n` +
            `እባክዎን ከታች ካሉት አማራጮች የሚፈልጉትን ይምረ፡`,
            {
              protect_content: true,
              ...Markup.keyboard([
                ['📝 መመዝገቢያ', '📚 የክፍል ትምህርቶች'],
                ['❓ የእለቱ ጥያቄ', 'ℹ️ መረጃ & እገዛ']
              ]).resize()
            }
          );
        });

        // 📝 መመዝገቢያ ምርጫ
        bot.hears('📝 መመዝገቢያ', (ctx) => {
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

        // ማንኛውም ተራ ጽሑፍ ሲላክ (ለምሳሌ ስምና ክፍል ለምዝገባ)
        bot.on('text', async (ctx) => {
          const text = ctx.message.text;
          if (text.startsWith('/')) return;

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
        });

        // ጾታ ሲመረጥ
        bot.action(/sex_(.+)/, async (ctx) => {
          const gender = ctx.match[1] === 'male' ? 'ወንድ' : 'ሴት';
          await ctx.answerCbQuery();
          return ctx.editMessageText(
            `✅ *ምዝገባው በተሳካ ሁኔታ ተጠናቋል!*\n\n` +
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
