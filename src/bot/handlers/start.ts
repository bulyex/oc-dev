import { Context, Telegraf } from 'telegraf';
import { logger } from '../../utils/logger.js';
import { upsertUser } from '../../database/client.js';
import { resetState, setLastMessage } from '../state/index.js';
import { getOnboardingMessage } from '../onboarding/index.js';

export function registerStartHandler(bot: Telegraf<Context>) {
  bot.command('start', async (ctx) => {
    try {
      const telegramId = String(ctx.from?.id || '0');
      const userId = ctx.from?.id || 0;

      // Save user to database (if available)
      await upsertUser(
        telegramId,
        ctx.from?.first_name,
        ctx.from?.last_name,
        ctx.from?.username
      );

      const firstName = ctx.from?.first_name || 'Пользователь';

      // Reset user state (always start from message 1)
      await resetState(userId);

      // Get first onboarding message
      const onboardingMessage = getOnboardingMessage(1);

      // Send onboarding message
      const sentMessage = await ctx.reply(onboardingMessage.text, {
        reply_markup: onboardingMessage.keyboard
      });

      // Save state
      await setLastMessage(userId, 1, sentMessage.message_id);

      logger.info('Onboarding started', { telegramId, firstName, messageId: sentMessage.message_id });
    } catch (error) {
      logger.error('Error in start handler:', error);
      try {
        await ctx.reply('Произошла ошибка при запуске бота. Попробуйте /start снова.');
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  });
}
