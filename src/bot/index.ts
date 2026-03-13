import { Context, Telegraf } from 'telegraf';
import { logger } from '../utils/logger.js';
import { registerStartHandler } from './handlers/start.js';
import { registerTextHandler } from './handlers/text.js';
import { registerNonTextHandler } from './handlers/nonText.js';

export function setupBotHandlers(bot: Telegraf<Context>) {
  // Global error handling to prevent polling loop crashes
  bot.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      logger.error('Unhandled error in bot middleware:', error);
      // Reply to user if possible
      try {
        await ctx.reply('Произошла ошибка при обработке сообщения.');
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
      // Don't throw - let polling continue
    }
  });

  registerStartHandler(bot);
  registerTextHandler(bot);
  registerNonTextHandler(bot);

  logger.info('Bot handlers registered');
}