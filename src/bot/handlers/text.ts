import { Context, Telegraf } from 'telegraf';
import { logger } from '../../utils/logger.js';
import { getLastMessage, setLastMessage } from '../state/index.js';
import { getOnboardingMessage } from '../onboarding/index.js';

export function registerTextHandler(bot: Telegraf<Context>) {
  bot.on('text', async (ctx) => {
    try {
      const text = ctx.message?.text;
      const userId = ctx.from?.id || 0;

      if (!text) {
        return;
      }

      // Check if this is a command (should be handled by other handlers)
      if (text.startsWith('/')) {
        return;
      }

      // Get last message state
      const state = await getLastMessage(userId);

      if (!state || !state.lastMessageType) {
        logger.info('Text message received but no onboarding state - suggesting /start', {
          userId
        });
        await ctx.reply('Начните онбординг с команды /start');
        return;
      }

      // Repeat last onboarding message
      const onboardingMessage = getOnboardingMessage(state.lastMessageType);

      const sentMessage = await ctx.reply(onboardingMessage.text, {
        reply_markup: onboardingMessage.keyboard
      });

      // Update state with new message ID
      await setLastMessage(userId, state.lastMessageType, sentMessage.message_id);

      logger.info('Last onboarding message repeated', {
        userId,
        messageType: state.lastMessageType,
        messageId: sentMessage.message_id
      });
    } catch (error) {
      logger.error('Error in text handler:', error);
      try {
        await ctx.reply('Произошла ошибка. Попробуйте /start снова.');
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  });
}
