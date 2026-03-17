import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  telegramBotToken: z.string().min(1),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  databaseUrl: z.string().optional(),
  redisUrl: z.string().optional(),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info')
});

const parsed = configSchema.safeParse({
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  nodeEnv: process.env.NODE_ENV,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  logLevel: process.env.LOG_LEVEL
});

if (!parsed.success) {
  console.error('Config validation failed:', parsed.error.flatten());
  process.exit(1);
}

const config = parsed.data;

const hasDatabase = !!config.databaseUrl && config.databaseUrl.length > 0;
const hasRedis = !!config.redisUrl && config.redisUrl.length > 0;

export { config };
export const isProduction = config.nodeEnv === 'production';
export const isDevelopment = config.nodeEnv === 'development';
export { hasDatabase, hasRedis };
