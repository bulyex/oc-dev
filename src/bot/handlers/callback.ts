import { Context, Telegraf } from 'telegraf';
import { logger } from '../../utils/logger.js';
import {
  setLastMessage,
  validateCallback,
  getNextMessageType
} from '../state/index.js';
import {
  parseCallbackData,
  getOnboardingMessage
} from '../onboarding/index.js';

// Debounce to prevent rapid sequential button presses (500ms)
const debounceMap = new Map<number, number>();
const DEBOUNCE_MS = 500;

export function registerCallbackHandler(bot: Telegraf<Context>) {
  bot.on('callback_query', async (ctx) => {
    try {
      const callbackQuery = ctx.callbackQuery;
      const userId = ctx.from?.id || 0;

      if (!callbackQuery || 'data' in callbackQuery === false) {
        await ctx.answerCbQuery('Неверный формат кнопки');
        return;
      }

      const callbackData = callbackQuery.data;
      if (!callbackData) {
        await ctx.answerCbQuery('Неверный формат кнопки');
        return;
      }

      // Parse callback data
      const parsed = parseCallbackData(callbackData);
      if (!parsed) {
        logger.warn('Invalid callback data format', { userId, callbackData });
        await ctx.answerCbQuery('Неверный формат кнопки');
        await ctx.reply('Кнопка устарела, начните с /start');
        return;
      }

      // Check debounce (prevent rapid double-clicks)
      const lastCallbackTime = debounceMap.get(userId) || 0;
      const now = Date.now();
      if (now - lastCallbackTime < DEBOUNCE_MS) {
        logger.debug('Callback debounced', { userId });
        await ctx.answerCbQuery('Подождите немного...');
        return;
      }
      debounceMap.set(userId, now);

      // Validate callback (check if button is still valid)
      const isValid = validateCallback(userId, parsed.messageType, parsed.timestamp);
      if (!isValid) {
        logger.warn('Callback validation failed', { userId, messageType: parsed.messageType });
        await ctx.answerCbQuery('Кнопка устарела');
        await ctx.reply('Кнопка устарела, начните с /start');
        return;
      }

      // Get next message type
      const nextMessageType = getNextMessageType(parsed.messageType);
      if (!nextMessageType) {
        // This is the last message - button is a stub
        logger.info('End of onboarding reached', { userId });
        await ctx.answerCbQuery('Это последняя кнопка');
        return;
      }

      // Get next onboarding message
      const nextMessage = getOnboardingMessage(nextMessageType);

      // Send next message
      const sentMessage = await ctx.reply(nextMessage.text, {
        reply_markup: nextMessage.keyboard
      });

      // Update state
      setLastMessage(userId, nextMessageType, sentMessage.message_id);

      // Answer callback to remove "clock" icon
      await ctx.answerCbQuery();

      logger.info('Onboarding step completed', {
        userId,
        fromMessageType: parsed.messageType,
        toMessageType: nextMessageType,
        messageId: sentMessage.message_id
      });
    } catch (error) {
      logger.error('Error in callback handler:', error);
      try {
        await ctx.answerCbQuery('Произошла ошибка');
        await ctx.reply('Произошла ошибка. Попробуйте /start снова.');
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  });
}