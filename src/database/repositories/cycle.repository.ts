import { getPrismaClient } from '../client.js';
import { logger } from '../../utils/logger.js';

/**
 * Create Cycle with visionText
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
 * Get active Cycle for user
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
 * Update Cycle.planText
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
 * Complete cycle (mark as completed)
 */
export async function completeCycle(cycleId: string): Promise<boolean> {
  const client = getPrismaClient();
  if (!client) return false;
  try {
    await client.cycle.update({
      where: { id: cycleId },
      data: { status: 'completed' },
    });
    logger.info('Cycle completed', { cycleId });
    return true;
  } catch (error) {
    logger.error('Failed to complete cycle', { cycleId, error });
    return false;
  }
}
