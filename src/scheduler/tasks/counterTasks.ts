import { getPrismaClient } from '../../database/client.js';
import { updateCycleCounters } from '../../database/repositories/cycle.repository.js';
import { logger } from '../../utils/logger.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const MS_PER_CYCLE = 84 * MS_PER_DAY;

/**
 * Increment dayCount for all active Cycles.
 * Runs daily at 5:00 MSK.
 * Increments if daysSinceStart > current dayCount.
 */
export async function runDayCounterTask(): Promise<void> {
  const client = getPrismaClient();
  if (!client) {
    logger.warn('DayCounterTask: no database connection, skipping');
    return;
  }

  logger.info('DayCounterTask: starting');

  let processed = 0;
  let incremented = 0;
  let errors = 0;

  try {
    const cycles = await client.cycle.findMany({
      where: {
        status: 'active',
        activeStartedAt: { not: null },
      },
      select: { id: true, activeStartedAt: true, dayCount: true },
    });

    logger.info(`DayCounterTask: found ${cycles.length} active cycles`);

    for (const cycle of cycles) {
      if (!cycle.activeStartedAt) continue;

      try {
        const now = Date.now();
        const activeStartedAtMs = cycle.activeStartedAt.getTime();
        const daysSinceStart = Math.floor((now - activeStartedAtMs) / MS_PER_DAY);

        // Only increment if calculated counter exceeds stored counter
        if (daysSinceStart > cycle.dayCount) {
          await updateCycleCounters(cycle.id, { dayCount: daysSinceStart });
          incremented++;
        }

        processed++;
      } catch (cycleError) {
        errors++;
        logger.error(`DayCounterTask: failed to process cycle ${cycle.id}`, { error: cycleError });
      }
    }

    logger.info(`DayCounterTask: completed`, { processed, incremented, errors });
  } catch (error) {
    logger.error('DayCounterTask: failed to fetch cycles', { error });
  }
}

/**
 * Increment weekCount for all active Cycles.
 * Runs daily at 5:00 MSK.
 * Increments if full weeks since start > current weekCount.
 */
export async function runWeekCounterTask(): Promise<void> {
  const client = getPrismaClient();
  if (!client) {
    logger.warn('WeekCounterTask: no database connection, skipping');
    return;
  }

  logger.info('WeekCounterTask: starting');

  let processed = 0;
  let incremented = 0;
  let errors = 0;

  try {
    const cycles = await client.cycle.findMany({
      where: {
        status: 'active',
        activeStartedAt: { not: null },
      },
      select: { id: true, activeStartedAt: true, weekCount: true },
    });

    logger.info(`WeekCounterTask: found ${cycles.length} active cycles`);

    for (const cycle of cycles) {
      if (!cycle.activeStartedAt) continue;

      try {
        const now = Date.now();
        const activeStartedAtMs = cycle.activeStartedAt.getTime();
        const weeksSinceStart = Math.floor((now - activeStartedAtMs) / MS_PER_WEEK);

        // Only increment if calculated counter exceeds stored counter
        if (weeksSinceStart > cycle.weekCount) {
          await updateCycleCounters(cycle.id, { weekCount: weeksSinceStart });
          incremented++;
        }

        processed++;
      } catch (cycleError) {
        errors++;
        logger.error(`WeekCounterTask: failed to process cycle ${cycle.id}`, { error: cycleError });
      }
    }

    logger.info(`WeekCounterTask: completed`, { processed, incremented, errors });
  } catch (error) {
    logger.error('WeekCounterTask: failed to fetch cycles', { error });
  }
}

/**
 * Increment cycleCount for all active Cycles.
 * Runs daily at 5:00 MSK.
 * Increments if full 84-day cycles since start > current cycleCount.
 */
export async function runCycleCounterTask(): Promise<void> {
  const client = getPrismaClient();
  if (!client) {
    logger.warn('CycleCounterTask: no database connection, skipping');
    return;
  }

  logger.info('CycleCounterTask: starting');

  let processed = 0;
  let incremented = 0;
  let errors = 0;

  try {
    const cycles = await client.cycle.findMany({
      where: {
        status: 'active',
        activeStartedAt: { not: null },
      },
      select: { id: true, activeStartedAt: true, cycleCount: true },
    });

    logger.info(`CycleCounterTask: found ${cycles.length} active cycles`);

    for (const cycle of cycles) {
      if (!cycle.activeStartedAt) continue;

      try {
        const now = Date.now();
        const activeStartedAtMs = cycle.activeStartedAt.getTime();
        const cyclesSinceStart = Math.floor((now - activeStartedAtMs) / MS_PER_CYCLE);

        // Only increment if calculated counter exceeds stored counter
        if (cyclesSinceStart > cycle.cycleCount) {
          await updateCycleCounters(cycle.id, { cycleCount: cyclesSinceStart });
          incremented++;
        }

        processed++;
      } catch (cycleError) {
        errors++;
        logger.error(`CycleCounterTask: failed to process cycle ${cycle.id}`, { error: cycleError });
      }
    }

    logger.info(`CycleCounterTask: completed`, { processed, incremented, errors });
  } catch (error) {
    logger.error('CycleCounterTask: failed to fetch cycles', { error });
  }
}
