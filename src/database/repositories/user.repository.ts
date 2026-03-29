import { getPrismaClient } from '../client.js';
import { logger } from '../../utils/logger.js';

/**
 * Upsert user by telegramId
 */
export async function upsertUser(
  telegramId: string,
  firstName?: string,
  lastName?: string,
  username?: string
) {
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
        updatedAt: new Date(),
      },
      create: {
        telegramId,
        firstName,
        lastName,
        username,
      },
    });

    logger.info('User saved', { telegramId, userId: user.id });
    return user;
  } catch (error) {
    logger.error('Failed to save user:', error);
    return null;
  }
}

/**
 * Get user by telegramId
 */
export async function getUserByTelegramId(
  telegramId: string
): Promise<{ id: string; telegramId: string; vision: string | null } | null> {
  const client = getPrismaClient();
  if (!client) return null;
  try {
    const user = await client.user.findUnique({
      where: { telegramId },
      select: { id: true, telegramId: true, vision: true },
    });
    return user;
  } catch (error) {
    logger.error('Failed to get user by telegramId', { telegramId, error });
    return null;
  }
}

/**
 * Get user vision
 */
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

/**
 * Save user vision
 */
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

/**
 * Get user goals
 */
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

/**
 * Save user goals
 */
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

/**
 * Get user plan
 */
export async function getUserPlan(telegramId: string): Promise<string | null> {
  const client = getPrismaClient();
  if (!client) return null;
  try {
    const user = await client.user.findUnique({
      where: { telegramId },
      select: { plan: true },
    });
    return user?.plan || null;
  } catch (error) {
    logger.error('Failed to get plan from database', { telegramId, error });
    return null;
  }
}

/**
 * Save user plan
 */
export async function saveUserPlan(telegramId: string, plan: string): Promise<void> {
  const client = getPrismaClient();
  if (!client) return;
  try {
    await client.user.update({
      where: { telegramId },
      data: { plan },
    });
    logger.info('Plan saved to database', { telegramId, planLength: plan.length });
  } catch (error) {
    logger.error('Failed to save plan to database', { telegramId, error });
    throw error;
  }
}

/**
 * Delete user and all related data
 * Cascades: Cycle -> Goal, Week -> Day, WeekAction -> ActionCompletion
 */
export async function deleteUser(telegramId: string): Promise<boolean> {
  const client = getPrismaClient();
  if (!client) return false;
  try {
    await client.user.delete({
      where: { telegramId },
    });
    logger.info('User deleted with all related data', { telegramId });
    return true;
  } catch (error) {
    logger.error('Failed to delete user', { telegramId, error });
    return false;
  }
}

/**
 * Get user status for /status command
 */
export async function getUserStatus(
  telegramId: string
): Promise<{
  fsmState: string;
  hasCycle: boolean;
  cycleLengthInWeeks: number;
  currentWeek: number | null;
  lastUpdate: Date | null;
} | null> {
  const client = getPrismaClient();
  if (!client) return null;
  try {
    const user = await client.user.findUnique({
      where: { telegramId },
      select: {
        fsmState: true,
        updatedAt: true,
        cycles: {
          where: { status: 'active' },
          select: {
            id: true,
            currentWeek: true,
            weeks: { select: { id: true } },
          },
          take: 1,
        },
      },
    });

    if (!user) return null;

    const activeCycle = user.cycles[0];

    return {
      fsmState: user.fsmState,
      hasCycle: !!activeCycle,
      cycleLengthInWeeks: activeCycle?.weeks.length || 0,
      currentWeek: activeCycle?.currentWeek || null,
      lastUpdate: user.updatedAt,
    };
  } catch (error) {
    logger.error('Failed to get user status', { telegramId, error });
    return null;
  }
}
