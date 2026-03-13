import { Context, Telegraf } from 'telegraf';
import { logger } from '../../utils/logger.js';

export function registerNonTextHandler(bot: Telegraf<Context>) {
  // Handle all non-text messages: photos, stickers, audio, video, etc.
  bot.on('photo', async (ctx) => {
    try {
      await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
      logger.info('Non-text message received (photo)', { telegramId: Number(ctx.from?.id) });
    } catch (error) {
      logger.error('Error in photo handler:', error);
    }
  });

  bot.on('sticker', async (ctx) => {
    try {
      await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
      logger.info('Non-text message received (sticker)', { telegramId: Number(ctx.from?.id) });
    } catch (error) {
      logger.error('Error in sticker handler:', error);
    }
  });

  bot.on('voice', async (ctx) => {
    try {
      await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
      logger.info('Non-text message received (voice)', { telegramId: Number(ctx.from?.id) });
    } catch (error) {
      logger.error('Error in voice handler:', error);
    }
  });

  bot.on('video', async (ctx) => {
    try {
      await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
      logger.info('Non-text message received (video)', { telegramId: Number(ctx.from?.id) });
    } catch (error) {
      logger.error('Error in video handler:', error);
    }
  });

  bot.on('audio', async (ctx) => {
    try {
      await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
      logger.info('Non-text message received (audio)', { telegramId: Number(ctx.from?.id) });
    } catch (error) {
      logger.error('Error in audio handler:', error);
    }
  });

  bot.on('document', async (ctx) => {
    try {
      await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
      logger.info('Non-text message received (document)', { telegramId: Number(ctx.from?.id) });
    } catch (error) {
      logger.error('Error in document handler:', error);
    }
  });

  // Catch-all for any other message type
  bot.on('message', async (ctx) => {
    try {
      const message = ctx.message;

      // Skip if already handled by other handlers
      if (message && 'text' in message) {
        return;
      }

      // Skip if handled by specific handlers above
      if (message && (
        'photo' in message ||
        'sticker' in message ||
        'voice' in message ||
        'video' in message ||
        'audio' in message ||
        'document' in message
      )) {
        return;
      }

      await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
      logger.info('Non-text message received (other)', { telegramId: Number(ctx.from?.id) });
    } catch (error) {
      logger.error('Error in catch-all handler:', error);
    }
  });
}