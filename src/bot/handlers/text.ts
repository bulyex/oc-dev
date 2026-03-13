import { Context, Telegraf } from 'telegraf';
import { logger } from '../../utils/logger.js';

export function registerTextHandler(bot: Telegraf<Context>) {
  bot.on('text', async (ctx) => {
    try {
      const text = ctx.message?.text;
      const telegramId = ctx.from?.id || 0;

      if (!text) {
        return;
      }

      // Echo the message back
      await ctx.reply(`Эхо: ${text}`);
      logger.info('Text message echoed', { telegramId: Number(telegramId), textLength: text.length });
    } catch (error) {
      logger.error('Error in text handler:', error);
      // Don't throw - let polling continue
    }
  });
}