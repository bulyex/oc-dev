import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { hasDatabase } from '../config/index.js';

let prisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient | null {
  if (!hasDatabase) {
    logger.warn('DATABASE_URL not configured - running in degraded mode');
    return null;
  }

  if (!prisma) {
    prisma = new PrismaClient();
    prisma.$connect()
      .then(() => logger.info('Database connected successfully'))
      .catch((error) => {
        logger.error('Failed to connect to database:', error);
        prisma = null;
      });
  }

  return prisma;
}

export async function upsertUser(telegramId: bigint, firstName?: string, lastName?: string, username?: string) {
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

export async function disconnectDatabase() {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Database disconnected');
    prisma = null;
  }
}