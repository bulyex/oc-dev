import { Context, Telegraf } from 'telegraf';
import { logger } from '../../utils/logger.js';
import { getLastMessage, setLastMessage } from '../state/index.js';
import { getOnboardingMessage } from '../onboarding/index.js';

export function registerNonTextHandler(bot: Telegraf<Context>) {
  const handleNonText = async (ctx: Context, mediaType: string) => {
    try {
      const userId = ctx.from?.id || 0;

      // Get last message state
      const state = getLastMessage(userId);

      if (!state || !state.lastMessageType) {
        logger.info('Non-text message received but no onboarding state - suggesting /start', {
          userId,
          mediaType
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
      setLastMessage(userId, state.lastMessageType, sentMessage.message_id);

      logger.info('Last onboarding message repeated (media)', {
        userId,
        messageType: state.lastMessageType,
        messageId: sentMessage.message_id,
        mediaType
      });
    } catch (error) {
      logger.error('Error in non-text handler:', error);
      try {
        await ctx.reply('Произошла ошибка. Попробуйте /start снова.');
      } catch (replyError) {
        logger.error('Failed to send error reply:', replyError);
      }
    }
  };

  // Handle all non-text messages: photos, stickers, audio, video, etc.
  bot.on('photo', (ctx) => handleNonText(ctx, 'photo'));
  bot.on('sticker', (ctx) => handleNonText(ctx, 'sticker'));
  bot.on('voice', (ctx) => handleNonText(ctx, 'voice'));
  bot.on('video', (ctx) => handleNonText(ctx, 'video'));
  bot.on('audio', (ctx) => handleNonText(ctx, 'audio'));
  bot.on('document', (ctx) => handleNonText(ctx, 'document'));

  // Catch-all for any other message type
  bot.on('message', async (ctx) => {
    try {
      const message = ctx.message;

      // Skip if already handled by other handlers
      if (!message) {
        return;
      }

      // Skip if it's a text message (handled by text handler)
      if ('text' in message) {
        return;
      }

      // Skip if handled by specific handlers above
      if (
        'photo' in message ||
        'sticker' in message ||
        'voice' in message ||
        'video' in message ||
        'audio' in message ||
        'document' in message
      ) {
        return;
      }

      // Handle any other message type
      await handleNonText(ctx, 'other');
    } catch (error) {
      logger.error('Error in catch-all non-text handler:', error);
    }
  });
}