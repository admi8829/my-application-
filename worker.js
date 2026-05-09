import { Telegraf } from 'telegraf';

/**
 * Cloudflare Worker Handler
 * Cloudflare does not support long-polling (bot.launch()) in the standard way.
 * This is configured to work via Webhooks.
 */

export default {
  async fetch(request, env) {
    if (!env.TELEGRAM_BOT_TOKEN) {
      return new Response('TELEGRAM_BOT_TOKEN is missing', { status: 500 });
    }

    const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

    // Bot logic - ሰላም? /start ሲባል hello ብሎ ይመልሳል
    bot.start((ctx) => ctx.reply('hello'));
    
    // ለሌሎች መልዕክቶች ምላሽ መስጠት ከፈለጉ እዚህ ይጨምሩ
    bot.on('text', (ctx) => {
      if (ctx.message.text.includes('ሰላም')) {
        ctx.reply('ሰላም! እንዴት ነህ?');
      }
    });

    try {
      // ይህ ለ Cloudflare environment ተብሎ የተሰራ ነው
      return await bot.handleUpdate(await request.json());
    } catch (err) {
      console.error(err);
      return new Response('Error processing update', { status: 500 });
    }
  },
};
