import { Telegraf, Markup } from 'telegraf';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

    // 1. Webhook Register Endpoint
    if (url.pathname === '/register') {
      try {
        const webhookUrl = `${url.origin}/telegraf`;
        await bot.telegram.setWebhook(webhookUrl);
        return new Response(`Webhook registered at: ${webhookUrl}`, { status: 200 });
      } catch (err) {
        return new Response(`Error: ${err.message}`, { status: 500 });
      }
    }

    // 2. Webhook Handler
    if (url.pathname === '/telegraf' && request.method === 'POST') {
      try {
        // --- Bot Logic ---
        
        // /start ሲባል የሚመጣ ምዝገባ
        bot.start((ctx) => {
          return ctx.reply(
            `ሰላም ${ctx.from.first_name || 'ተማሪ'}! እንኳን ደህና መጡ።\n` +
            `ለመመዝገብ እባክዎን መጀመሪያ "ስም" እና "ክፍል" በዚሁ ይላኩልኝ።\n` +
            `(ለምሳሌ፡ አቤል በቀለ፣ 10B)`
          );
        });

        // ተጠቃሚው መረጃ ሲልክ
        bot.on('text', (ctx) => {
          const msg = ctx.message.text;
          if (msg.startsWith('/')) return;

          return ctx.reply(
            `ተቀብያለሁ! ያስገቡት መረጃ፡ "${msg}"\n\nአሁን ደግሞ ጾታዎን ይምረጡ፡`,
            Markup.inlineKeyboard([
              [Markup.button.callback('ወንድ', 'gender_male'), Markup.button.callback('ሴት', 'gender_female')]
            ])
          );
        });

        // የጾታ ምርጫ ሲነካ
        bot.action(/gender_(.+)/, (ctx) => {
          const gender = ctx.match[1] === 'male' ? 'ወንድ' : 'ሴት';
          ctx.answerCbQuery();
          return ctx.editMessageText(`ምዝገባው ተጠናቋል!\nጾታ፡ ${gender}\nእናመሰግናለን!`);
        });

        // -----------------

        const update = await request.json();
        await bot.handleUpdate(update);
        return new Response('OK', { status: 200 });
      } catch (err) {
        console.error(err);
        return new Response('Error', { status: 500 });
      }
    }

    return new Response('Bot is active. Use /register to hook up.', { status: 200 });
  },
};
