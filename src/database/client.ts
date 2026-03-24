import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { hasDatabase } from '../config/index.js';

let prisma: PrismaClient | null = null;

function createPrismaClient(): PrismaClient {
  return new PrismaClient();
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

export async function disconnectDatabase() {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Database disconnected');
    prisma = null;
  }
}

// ============================================================
// TASK 13: Progress Tracking Integration
// ============================================================

/**
 * Sync FSM state from Redis to database
 * Updates User.fsmState field
 */
export async function syncFSMState(telegramId: string, fsmState: string): Promise<void> {
  const client = getPrismaClient();
  if (!client) return;
  try {
    await client.user.update({
      where: { telegramId },
      data: { fsmState },
    });
    logger.debug('FSM state synced to database', { telegramId, fsmState });
  } catch (error) {
    logger.error('Failed to sync FSM state to database', { telegramId, error });
    // Non-blocking: don't throw, just log
  }
}

/**
 * Get User by telegramId
 * Returns user with id for creating related records
 */
export async function getUserByTelegramId(telegramId: string): Promise<{ id: string; telegramId: string; vision: string | null } | null> {
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
 * Create Cycle with visionText
 * Called at goals_accept (when both vision and goals exist)
 */
export async function createCycle(
  userId: string,
  visionText: string,
  goalsText: string
): Promise<{ id: string } | null> {
  const client = getPrismaClient();
  if (!client) return null;
  try {
    const cycle = await client.cycle.create({
      data: {
        userId,
        visionText,
        goalsText,
        status: 'active',
        weekCount: 12,
        currentWeek: 1,
      },
    });
    logger.info('Cycle created', { userId, cycleId: cycle.id, visionLength: visionText.length });
    return { id: cycle.id };
  } catch (error) {
    logger.error('Failed to create cycle', { userId, error });
    return null;
  }
}

/**
 * Parse goals text into individual goals
 * Simple regex split by numbered list (1., 2., 3.)
 * Falls back to single goal if parsing fails
 */
function parseGoalsText(goalsText: string): Array<{ order: number; description: string }> {
  // Try to match numbered list pattern: "1. ...", "2. ...", "3. ..."
  const numberedPattern = /(?:^|\n)\s*(\d+)\.\s*([^\n]+(?:\n(?!\s*\d+\.)[^\n]*)*)/g;
  const matches: Array<{ order: number; description: string }> = [];
  let match;

  while ((match = numberedPattern.exec(goalsText)) !== null) {
    const order = parseInt(match[1], 10);
    const description = match[2].trim();
    if (description) {
      matches.push({ order, description });
    }
  }

  // If we found numbered goals, return them
  if (matches.length > 0) {
    return matches.sort((a, b) => a.order - b.order);
  }

  // Fallback: single goal with full text
  return [{ order: 1, description: goalsText.trim() }];
}

/**
 * Create Goal[] records from goalsText
 * Called at goals_accept after createCycle
 */
export async function createGoals(cycleId: string, goalsText: string): Promise<void> {
  const client = getPrismaClient();
  if (!client) return;
  try {
    const parsedGoals = parseGoalsText(goalsText);

    for (const goal of parsedGoals) {
      await client.goal.create({
        data: {
          cycleId,
          order: goal.order,
          description: goal.description,
          status: 'active',
        },
      });
    }

    logger.info('Goals created', { cycleId, count: parsedGoals.length });
  } catch (error) {
    logger.error('Failed to create goals', { cycleId, error });
    throw error;
  }
}

/**
 * Update Cycle.planText
 * Called at plan_accept
 */
export async function updateCyclePlan(cycleId: string, planText: string): Promise<void> {
  const client = getPrismaClient();
  if (!client) return;
  try {
    await client.cycle.update({
      where: { id: cycleId },
      data: { planText },
    });
    logger.info('Cycle planText updated', { cycleId, planLength: planText.length });
  } catch (error) {
    logger.error('Failed to update cycle planText', { cycleId, error });
    throw error;
  }
}

/**
 * Get active Cycle for user
 * Returns cycle id for plan_accept hook
 */
export async function getActiveCycleForUser(userId: string): Promise<{ id: string } | null> {
  const client = getPrismaClient();
  if (!client) return null;
  try {
    const cycle = await client.cycle.findFirst({
      where: { userId, status: 'active' },
      select: { id: true },
      orderBy: { startedAt: 'desc' },
    });
    return cycle;
  } catch (error) {
    logger.error('Failed to get active cycle for user', { userId, error });
    return null;
  }
}

/**
 * Create first Week (week 1) with 7 Days
 * Called at plan_accept
 * Timezone: Europe/Moscow
 */
export async function createFirstWeek(cycleId: string): Promise<void> {
  const client = getPrismaClient();
  if (!client) return;
  try {
    // Create Week 1
    const week = await client.week.create({
      data: {
        cycleId,
        weekNumber: 1,
        status: 'active',
      },
    });

    // Create 7 Days
    // Use Europe/Moscow timezone for date calculation
    const now = new Date();
    const moscowOffset = 3 * 60; // Moscow is UTC+3

    for (let dayNumber = 1; dayNumber <= 7; dayNumber++) {
      // Calculate date for this day
      const dayDate = new Date(now);
      dayDate.setUTCDate(dayDate.getUTCDate() + (dayNumber - 1));
      // Adjust for Moscow timezone (store date in Moscow time)
      dayDate.setUTCHours(0, 0, 0, 0); // Start of day in UTC
      dayDate.setUTCMinutes(dayDate.getUTCMinutes() + moscowOffset);

      await client.day.create({
        data: {
          weekId: week.id,
          dayNumber,
          date: dayDate,
        },
      });
    }

    logger.info('First week created with 7 days', { cycleId, weekId: week.id });
  } catch (error) {
    logger.error('Failed to create first week', { cycleId, error });
    throw error;
  }
}

/**
 * Delete User and all related data
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
export async function getUserStatus(telegramId: string): Promise<{
  fsmState: string;
  hasCycle: boolean;
  weekCount: number;
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
      weekCount: activeCycle?.weeks.length || 0,
      currentWeek: activeCycle?.currentWeek || null,
      lastUpdate: user.updatedAt,
    };
  } catch (error) {
    logger.error('Failed to get user status', { telegramId, error });
    return null;
  }
}
