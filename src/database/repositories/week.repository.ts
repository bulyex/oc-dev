import { getPrismaClient } from '../client.js';
import { logger } from '../../utils/logger.js';
import { getMoscowDateForDayOffset, getMoscowDayOfWeek } from '../../utils/datetime.js';

/**
 * Create first Week (week 1) with 7 Days
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

    // Create 7 Days using luxon for Moscow timezone
    for (let dayNumber = 1; dayNumber <= 7; dayNumber++) {
      const dayDate = getMoscowDateForDayOffset(dayNumber - 1);

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
 * Get active week for user
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

/**
 * Get or create today's Day for a week
 * Timezone: Europe/Moscow
 */
export async function getOrCreateTodayDay(
  weekId: string
): Promise<{ id: string; dayNumber: number } | null> {
  const client = getPrismaClient();
  if (!client) return null;
  try {
    // Calculate today's date in Moscow timezone using luxon
    const todayDate = getMoscowDateForDayOffset(0);

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

    // Calculate dayNumber: use current day of week (1-7)
    const dayNumber = getMoscowDayOfWeek();

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
 * Get or create week for a cycle
 */
export async function getOrCreateWeek(
  cycleId: string,
  weekNumber: number
): Promise<{ id: string } | null> {
  const client = getPrismaClient();
  if (!client) return null;
  try {
    // Try to find existing week
    const existingWeek = await client.week.findFirst({
      where: { cycleId, weekNumber },
      select: { id: true },
    });

    if (existingWeek) {
      return existingWeek;
    }

    // Create new week
    const newWeek = await client.week.create({
      data: {
        cycleId,
        weekNumber,
        status: 'active',
      },
    });

    logger.info('Week created', { cycleId, weekId: newWeek.id, weekNumber });
    return { id: newWeek.id };
  } catch (error) {
    logger.error('Failed to get or create week', { cycleId, weekNumber, error });
    return null;
  }
}

/**
 * Update day daily plan text
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
