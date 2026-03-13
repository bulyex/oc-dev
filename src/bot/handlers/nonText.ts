import { Context, Telegraf } from 'telegraf';
import { logger } from '../../utils/logger.js';

export function registerNonTextHandler(bot: Telegraf<Context>) {
  // Handle all non-text messages: photos, stickers, audio, video, etc.
  bot.on('photo', async (ctx) => {
    await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
    logger.info('Non-text message received (photo)', { telegramId: ctx.from?.id });
  });

  bot.on('sticker', async (ctx) => {
    await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
    logger.info('Non-text message received (sticker)', { telegramId: ctx.from?.id });
  });

  bot.on('voice', async (ctx) => {
    await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
    logger.info('Non-text message received (voice)', { telegramId: ctx.from?.id });
  });

  bot.on('video', async (ctx) => {
    await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
    logger.info('Non-text message received (video)', { telegramId: ctx.from?.id });
  });

  bot.on('audio', async (ctx) => {
    await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
    logger.info('Non-text message received (audio)', { telegramId: ctx.from?.id });
  });

  bot.on('document', async (ctx) => {
    await ctx.reply('Пожалуйста, отправьте текстовое сообщение.');
    logger.info('Non-text message received (document)', { telegramId: ctx.from?.id });
  });

  // Catch-all for any other message type
  bot.on('message', async (ctx) => {
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
    logger.info('Non-text message received (other)', { telegramId: ctx.from?.id });
  });
}