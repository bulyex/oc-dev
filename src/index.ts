import { Telegraf } from 'telegraf';
import { logger } from './utils/logger.js';
import { config } from './config/index.js';
import { setupBotHandlers } from './bot/index.js';
import { getPrismaClient, disconnectDatabase } from './database/client.js';

// Initialize bot
const bot = new Telegraf(config.telegramBotToken);

// Setup handlers
setupBotHandlers(bot);

// Graceful shutdown handlers
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress');
    return;
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  try {
    // Stop receiving new updates
    bot.stop();
    logger.info('Bot stopped receiving updates');

    // Disconnect database
    await disconnectDatabase();

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Register signal handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection:', { reason, promise });
  gracefulShutdown('unhandledRejection');
});

// Start bot
async function start() {
  try {
    // Test database connection (if available)
    const prisma = getPrismaClient();
    if (prisma) {
      logger.info('Database available - running in normal mode');
    } else {
      logger.warn('Database not available - running in degraded mode');
    }

    // Start bot
    logger.info('Starting bot...');
    await bot.launch();

    logger.info('Bot started successfully');
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

start();
