import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { logger } from '../utils/logger.js';
import { hasDatabase, config } from '../config/index.js';

let prisma: PrismaClient | null = null;

function createPrismaClient(): PrismaClient {
  const dbUrl = config.databaseUrl ?? 'file:./data/dev.db';
  let dbPath = dbUrl;
  if (dbUrl.startsWith('file:')) {
    dbPath = dbUrl.slice(5); // strip "file:" prefix
  }
  const adapter = new PrismaBetterSqlite3({ url: dbPath });
  return new PrismaClient({ adapter });
}

export function getPrismaClient(): PrismaClient | null {
  if (!hasDatabase) {
    logger.warn('DATABASE_URL not configured - running in degraded mode');
    return null;
  }

  if (!prisma) {
    prisma = createPrismaClient();
    prisma.$connect()
      .then(() => logger.info('Database connected successfully'))
      .catch((error) => {
        logger.error('Failed to connect to database:', error);
        prisma = null;
      });
  }

  return prisma;
}

export async function upsertUser(telegramId: string, firstName?: string, lastName?: string, username?: string) {
  const client = getPrismaClient();

  if (!client) {
    logger.warn('Cannot save user - database not available', { telegramId });
    return null;
  }

  try {
    const user = await client.user.upsert({
      where: { telegramId },
      update: {
        firstName,
        lastName,
        username,
        updatedAt: new Date()
      },
      create: {
        telegramId,
        firstName,
        lastName,
        username
      }
    });

    logger.info('User saved', { telegramId, userId: user.id });
    return user;
  } catch (error) {
    logger.error('Failed to save user:', error);
    return null;
  }
}

export async function getUserVision(telegramId: string): Promise<string | null> {
  const client = getPrismaClient();
  if (!client) return null;
  try {
    const user = await client.user.findUnique({
      where: { telegramId },
      select: { vision: true },
    });
    return user?.vision || null;
  } catch (error) {
    logger.error('Failed to get vision from database', { telegramId, error });
    return null;
  }
}

export async function saveUserVision(telegramId: string, vision: string): Promise<void> {
  const client = getPrismaClient();
  if (!client) return;
  try {
    await client.user.update({
      where: { telegramId },
      data: { vision },
    });
    logger.info('Vision saved to database', { telegramId, visionLength: vision.length });
  } catch (error) {
    logger.error('Failed to save vision to database', { telegramId, error });
    throw error;
  }
}

export async function saveUserGoals(telegramId: string, goals: string): Promise<void> {
  const client = getPrismaClient();
  if (!client) return;
  try {
    await client.user.update({
      where: { telegramId },
      data: { goals },
    });
    logger.info('Goals saved to database', { telegramId, goalsLength: goals.length });
  } catch (error) {
    logger.error('Failed to save goals to database', { telegramId, error });
    throw error;
  }
}

export async function getUserGoals(telegramId: string): Promise<string | null> {
  const client = getPrismaClient();
  if (!client) return null;
  try {
    const user = await client.user.findUnique({
      where: { telegramId },
      select: { goals: true },
    });
    return user?.goals || null;
  } catch (error) {
    logger.error('Failed to get goals from database', { telegramId, error });
    return null;
  }
}

export async function disconnectDatabase() {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Database disconnected');
    prisma = null;
  }
}
