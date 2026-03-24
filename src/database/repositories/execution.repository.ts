import { getPrismaClient } from '../client.js';
import { logger } from '../../utils/logger.js';

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
 * Get today's actions with their completion status
 */
export async function getTodayActionsWithCompletions(
  telegramId: string
): Promise<
  Array<{
    actionId: string;
    actionText: string;
    order: number;
    status: 'pending' | 'done' | 'skipped';
    completionNote?: string;
  }> | null
> {
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
    const todayActions = weekActions.map((action) => {
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
