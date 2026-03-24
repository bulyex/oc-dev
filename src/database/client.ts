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

// ============================================================
// TASK 14: Execution Tracker Agent DB Functions
// ============================================================

/**
 * Create WeekAction records for a week (used when generating Mini Daily Plan)
 */
export async function createWeekActions(
  weekId: string,
  actions: Array<{ actionText: string; order: number }>
): Promise<Array<{ id: string; actionText: string; order: number }> | null> {
  const client = getPrismaClient();
  if (!client) return null;
  try {
    const created: Array<{ id: string; actionText: string; order: number }> = [];

    for (const action of actions) {
      const weekAction = await client.weekAction.create({
        data: {
          weekId,
          description: action.actionText,
          order: action.order,
        },
      });
      created.push({
        id: weekAction.id,
        actionText: weekAction.description,
        order: weekAction.order,
      });
    }

    logger.info('WeekActions created', { weekId, count: created.length });
    return created;
  } catch (error) {
    logger.error('Failed to create WeekActions', { weekId, error });
    return null;
  }
}

/**
 * Get or create today's Day for a week
 * Timezone: Europe/Moscow (UTC+3)
 */
export async function getOrCreateTodayDay(weekId: string): Promise<{ id: string; dayNumber: number } | null> {
  const client = getPrismaClient();
  if (!client) return null;
  try {
    // Calculate today's date in Moscow timezone
    const now = new Date();
    const moscowOffset = 3 * 60 * 60 * 1000; // Moscow is UTC+3 in milliseconds
    const moscowNow = new Date(now.getTime() + moscowOffset);
    const todayDate = new Date(moscowNow);
    todayDate.setUTCHours(0, 0, 0, 0);

    // Find today's day
    const existingDay = await client.day.findFirst({
      where: {
        weekId,
        date: {
          gte: todayDate,
          lt: new Date(todayDate.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      select: { id: true, dayNumber: true },
    });

    if (existingDay) {
      return existingDay;
    }

    // Find the week to get cycle info
    const week = await client.week.findUnique({
      where: { id: weekId },
      select: { cycleId: true, weekNumber: true },
    });

    if (!week) {
      logger.error('Week not found for getOrCreateTodayDay', { weekId });
      return null;
    }

    // Calculate dayNumber based on cycle start (day 1 = first day of week 1)
    // For simplicity: use current day of week (1-7)
    const dayOfWeek = moscowNow.getUTCDay();
    const dayNumber = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert Sunday (0) to 7

    // Create the day
    const newDay = await client.day.create({
      data: {
        weekId,
        dayNumber,
        date: todayDate,
      },
    });

    logger.info('Today Day created', { weekId, dayId: newDay.id, dayNumber });
    return { id: newDay.id, dayNumber: newDay.dayNumber };
  } catch (error) {
    logger.error('Failed to get or create today day', { weekId, error });
    return null;
  }
}

/**
 * Update dailyPlanText for a day
 */
export async function updateDayDailyPlan(dayId: string, dailyPlan: string): Promise<boolean> {
  const client = getPrismaClient();
  if (!client) return false;
  try {
    await client.day.update({
      where: { id: dayId },
      data: { dailyPlanText: dailyPlan },
    });
    logger.info('Day dailyPlanText updated', { dayId, planLength: dailyPlan.length });
    return true;
  } catch (error) {
    logger.error('Failed to update day dailyPlan', { dayId, error });
    return false;
  }
}

/**
 * Today's action with completion status
 */
export interface TodayAction {
  actionId: string;
  actionText: string;
  order: number;
  status: 'pending' | 'done' | 'skipped';
  completionNote?: string;
}

/**
 * Get today's actions with their completion status
 */
export async function getTodayActionsWithCompletions(telegramId: string): Promise<TodayAction[] | null> {
  const client = getPrismaClient();
  if (!client) return null;
  try {
    // Get user
    const user = await client.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });

    if (!user) {
      logger.warn('User not found for getTodayActionsWithCompletions', { telegramId });
      return [];
    }

    // Get active cycle
    const activeCycle = await client.cycle.findFirst({
      where: { userId: user.id, status: 'active' },
      select: { id: true },
    });

    if (!activeCycle) {
      logger.info('No active cycle for user', { telegramId });
      return [];
    }

    // Get active week
    const activeWeek = await client.week.findFirst({
      where: { cycleId: activeCycle.id, status: 'active' },
      select: { id: true },
    });

    if (!activeWeek) {
      logger.info('No active week for user', { telegramId });
      return [];
    }

    // Calculate today's date in Moscow timezone
    const now = new Date();
    const moscowOffset = 3 * 60 * 60 * 1000;
    const moscowNow = new Date(now.getTime() + moscowOffset);
    const todayDate = new Date(moscowNow);
    todayDate.setUTCHours(0, 0, 0, 0);

    // Find today's day
    const todayDay = await client.day.findFirst({
      where: {
        weekId: activeWeek.id,
        date: {
          gte: todayDate,
          lt: new Date(todayDate.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      select: { id: true },
    });

    // Get all week actions
    const weekActions = await client.weekAction.findMany({
      where: { weekId: activeWeek.id },
      select: { id: true, description: true, order: true },
      orderBy: { order: 'asc' },
    });

    if (weekActions.length === 0) {
      return [];
    }

    // Get completions for today (if day exists)
    const completions = todayDay
      ? await client.actionCompletion.findMany({
          where: { dayId: todayDay.id },
          select: { actionId: true, status: true, note: true },
        })
      : [];

    // Build completions map
    const completionsMap = new Map<string, { status: string; note?: string }>();
    for (const c of completions) {
      completionsMap.set(c.actionId, { status: c.status, note: c.note || undefined });
    }

    // Merge actions with completions
    const todayActions: TodayAction[] = weekActions.map((action) => {
      const completion = completionsMap.get(action.id);
      return {
        actionId: action.id,
        actionText: action.description,
        order: action.order,
        status: (completion?.status as 'pending' | 'done' | 'skipped') || 'pending',
        completionNote: completion?.note,
      };
    });

    return todayActions;
  } catch (error) {
    logger.error('Failed to get today actions with completions', { telegramId, error });
    return null;
  }
}

/**
 * Mark action as done (create or update ActionCompletion)
 */
export async function markActionDone(
  dayId: string,
  actionId: string,
  note?: string
): Promise<boolean> {
  const client = getPrismaClient();
  if (!client) return false;
  try {
    // Check if completion exists
    const existing = await client.actionCompletion.findUnique({
      where: {
        actionId_dayId: { actionId, dayId },
      },
    });

    if (existing) {
      // Update existing
      await client.actionCompletion.update({
        where: { id: existing.id },
        data: { status: 'done', note },
      });
      logger.info('ActionCompletion updated to done', { actionId, dayId });
    } else {
      // Create new
      await client.actionCompletion.create({
        data: {
          actionId,
          dayId,
          status: 'done',
          note,
        },
      });
      logger.info('ActionCompletion created as done', { actionId, dayId });
    }

    return true;
  } catch (error) {
    logger.error('Failed to mark action done', { actionId, dayId, error });
    return false;
  }
}

/**
 * Today's status for formatting responses
 */
export interface TodayStatus {
  total: number;
  done: number;
  pending: Array<{ actionId: string; actionText: string; order: number }>;
  dayId: string | null;
}

/**
 * Get today's status summary
 */
export async function getTodayStatus(telegramId: string): Promise<TodayStatus | null> {
  const client = getPrismaClient();
  if (!client) return null;
  try {
    // Get user
    const user = await client.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });

    if (!user) return null;

    // Get active cycle
    const activeCycle = await client.cycle.findFirst({
      where: { userId: user.id, status: 'active' },
      select: { id: true },
    });

    if (!activeCycle) return { total: 0, done: 0, pending: [], dayId: null };

    // Get active week
    const activeWeek = await client.week.findFirst({
      where: { cycleId: activeCycle.id, status: 'active' },
      select: { id: true },
    });

    if (!activeWeek) return { total: 0, done: 0, pending: [], dayId: null };

    // Calculate today's date in Moscow timezone
    const now = new Date();
    const moscowOffset = 3 * 60 * 60 * 1000;
    const moscowNow = new Date(now.getTime() + moscowOffset);
    const todayDate = new Date(moscowNow);
    todayDate.setUTCHours(0, 0, 0, 0);

    // Find today's day
    const todayDay = await client.day.findFirst({
      where: {
        weekId: activeWeek.id,
        date: {
          gte: todayDate,
          lt: new Date(todayDate.getTime() + 24 * 60 * 60 * 1000),
        },
      },
      select: { id: true },
    });

    // Get all week actions
    const weekActions = await client.weekAction.findMany({
      where: { weekId: activeWeek.id },
      select: { id: true, description: true, order: true },
      orderBy: { order: 'asc' },
    });

    if (weekActions.length === 0) {
      return { total: 0, done: 0, pending: [], dayId: todayDay?.id || null };
    }

    // Get completions for today
    const completions = todayDay
      ? await client.actionCompletion.findMany({
          where: { dayId: todayDay.id, status: 'done' },
          select: { actionId: true },
        })
      : [];

    const doneSet = new Set(completions.map((c) => c.actionId));

    const pending = weekActions
      .filter((a) => !doneSet.has(a.id))
      .map((a) => ({
        actionId: a.id,
        actionText: a.description,
        order: a.order,
      }));

    return {
      total: weekActions.length,
      done: doneSet.size,
      pending,
      dayId: todayDay?.id || null,
    };
  } catch (error) {
    logger.error('Failed to get today status', { telegramId, error });
    return null;
  }
}

/**
 * Get active week for user (helper for plan_accept)
 */
export async function getActiveWeekForUser(userId: string): Promise<{ id: string } | null> {
  const client = getPrismaClient();
  if (!client) return null;
  try {
    const activeCycle = await client.cycle.findFirst({
      where: { userId, status: 'active' },
      select: { id: true },
    });

    if (!activeCycle) return null;

    const activeWeek = await client.week.findFirst({
      where: { cycleId: activeCycle.id, status: 'active' },
      select: { id: true },
    });

    return activeWeek;
  } catch (error) {
    logger.error('Failed to get active week for user', { userId, error });
    return null;
  }
}
