import { Context, Telegraf } from 'telegraf';
import { logger } from '../../utils/logger.js';

export function registerTextHandler(bot: Telegraf<Context>) {
  bot.on('text', async (ctx) => {
    const text = ctx.message?.text;
    const telegramId = BigInt(ctx.from?.id || 0);

    if (!text) {
      return;
    }

    // Echo the message back
    await ctx.reply(`Эхо: ${text}`);
    logger.info('Text message echoed', { telegramId, textLength: text.length });
  });
}