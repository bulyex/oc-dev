import { Context, Telegraf } from 'telegraf';
import { logger } from '../utils/logger.js';
import { registerStartHandler } from './handlers/start.js';
import { registerTextHandler } from './handlers/text.js';
import { registerNonTextHandler } from './handlers/nonText.js';

export function setupBotHandlers(bot: Telegraf<Context>) {
  registerStartHandler(bot);
  registerTextHandler(bot);
  registerNonTextHandler(bot);

  logger.info('Bot handlers registered');
}