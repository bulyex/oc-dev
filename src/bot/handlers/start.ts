import { Context, Telegraf } from 'telegraf';
import { logger } from '../../utils/logger.js';
import { upsertUser } from '../../database/client.js';

export function registerStartHandler(bot: Telegraf<Context>) {
  bot.command('start', async (ctx) => {
    try {
      const telegramId = BigInt(ctx.from?.id || 0);

      // Save user to database
      await upsertUser(
        telegramId,
        ctx.from?.first_name,
        ctx.from?.last_name,
        ctx.from?.username
      );

      const firstName = ctx.from?.first_name || 'Пользователь';

      const welcomeMessage = `
👋 Привет, ${firstName}!

Я — Slowfire, твой бот для продуктивности по методике «12 недель в году».

Сейчас я в режиме Phase 0 (прототип).

Просто напиши мне что-нибудь, и я повторю — эхо-бот для тестирования!
    `.trim();

      await ctx.reply(welcomeMessage);
      logger.info('Start command executed', { telegramId: Number(telegramId), firstName });
    } catch (error) {
      logger.error('Error in start handler:', error);
      try {
        await ctx.reply('Произошла ошибка при запуске бота.');
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  });
}