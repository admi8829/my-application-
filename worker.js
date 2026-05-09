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
        // --- የምዝገባ ሎጂክ (Registration Flow) ---

        // /start ሲባል
        bot.start((ctx) => {
          return ctx.reply(
            `ሰላም ${ctx.from.first_name || 'ተማሪ'}! እንኳን ደህና መጡ።\n\n` +
            `ለመመዝገብ እባክዎን ስምዎን እና ክፍልዎን ይላኩ።\n` +
            `ለምሳሌ፡ "አቤል በቀለ፣ 10B"`,
            { protect_content: true }
          );
        });

        // መረጃ ሲላክ
        bot.on('text', async (ctx) => {
          const text = ctx.message.text;
          if (text.startsWith('/')) return;

          return ctx.reply(
            `ተቀብያለሁ! ያስገቡት መረጃ፡ "${text}"\n\nአሁን ደግሞ ጾታዎን ይምረጡ፡`,
            {
              protect_content: true,
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback('ወንድ', 'sex_male'),
                  Markup.button.callback('ሴት', 'sex_female')
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
            `✅ ምዝገባው ተጠናቋል!\n\n` +
            `ጾታ፡ ${gender}\n` +
            `ስለተመዘገቡ እናመሰግናለን!`
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

    // Dashboard ገጽ (ለማረጋገጫ ብቻ)
    return new Response('Telegram Bot Worker is Live. Path: /webhook', { status: 200 });
  },
};
