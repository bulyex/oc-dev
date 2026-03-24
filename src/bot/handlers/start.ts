import { Context, Telegraf } from 'telegraf';
import { logger } from '../../utils/logger.js';
import { upsertUser, deleteUser, getUserStatus } from '../../database/client.js';
import { resetState, setLastHelloMessage, setFSMState } from '../state/index.js';
import { UserFSMState } from '../state/types.js';
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

      // Set FSM state to STATE_HELLO
      await setFSMState(userId, UserFSMState.STATE_HELLO);

      // Get first onboarding message
      const onboardingMessage = getOnboardingMessage(1);

      // Send onboarding message
      const sentMessage = await ctx.reply(onboardingMessage.text, {
        reply_markup: onboardingMessage.keyboard
      });

      // Save state
      await setLastHelloMessage(userId, 1, sentMessage.message_id);

      logger.info('Onboarding started', { telegramId, firstName, messageId: sentMessage.message_id, fsmState: UserFSMState.STATE_HELLO });
    } catch (error) {
      logger.error('Error in start handler:', error);
      try {
        await ctx.reply('Произошла ошибка при запуске бота. Попробуйте /start снова.');
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  });

  // Task 13: /reset command
  bot.command('reset', async (ctx) => {
    try {
      const telegramId = String(ctx.from?.id || '0');
      const userId = ctx.from?.id || 0;

      // Delete user from database (cascades to all related data)
      const deleted = await deleteUser(telegramId);

      // Reset Redis state
      await resetState(userId);

      if (deleted) {
        await ctx.reply('Все данные сброшены. Напишите /start для нового старта.');
        logger.info('User data reset complete', { telegramId });
      } else {
        await ctx.reply('Данные сброшены (пользователь не найден в БД). Напишите /start для нового старта.');
        logger.info('User reset complete (user not in DB)', { telegramId });
      }
    } catch (error) {
      logger.error('Error in reset handler:', error);
      try {
        await ctx.reply('Произошла ошибка при сбросе данных. Попробуйте /start.');
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  });

  // Task 13: /status command
  bot.command('status', async (ctx) => {
    try {
      const telegramId = String(ctx.from?.id || '0');

      const status = await getUserStatus(telegramId);

      if (!status) {
        await ctx.reply('Пользователь не найден. Напишите /start.');
        return;
      }

      const fsmStateLabels: Record<string, string> = {
        'hello': 'Приветствие',
        'decision': 'Решение',
        'onboarding': 'Онбординг',
        'active': 'Активен',
      };

      const lines = [
        `📊 **Статус**`,
        ``,
        `Состояние: ${fsmStateLabels[status.fsmState] || status.fsmState}`,
      ];

      if (status.hasCycle) {
        lines.push(`Цикл: активен`);
        lines.push(`Текущая неделя: ${status.currentWeek || 1}`);
        lines.push(`Недель создано: ${status.weekCount}`);
      } else {
        lines.push(`Цикл: не создан`);
      }

      if (status.lastUpdate) {
        const date = new Date(status.lastUpdate);
        lines.push(`Последнее обновление: ${date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`);
      }

      await ctx.reply(lines.join('\n'));
      logger.info('Status requested', { telegramId, fsmState: status.fsmState });
    } catch (error) {
      logger.error('Error in status handler:', error);
      try {
        await ctx.reply('Произошла ошибка при получении статуса.');
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  });
}
