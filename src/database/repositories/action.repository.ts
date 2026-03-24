import { getPrismaClient } from '../client.js';
import { logger } from '../../utils/logger.js';

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
 * Create WeekAction records for a week
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
 * Get week actions for a week
 */
export async function getWeekActions(
  weekId: string
): Promise<Array<{ id: string; description: string; order: number }>> {
  const client = getPrismaClient();
  if (!client) return [];
  try {
    const actions = await client.weekAction.findMany({
      where: { weekId },
      select: { id: true, description: true, order: true },
      orderBy: { order: 'asc' },
    });
    return actions;
  } catch (error) {
    logger.error('Failed to get week actions', { weekId, error });
    return [];
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
 * Mark action as skipped
 */
export async function markActionSkipped(
  dayId: string,
  actionId: string,
  note?: string
): Promise<boolean> {
  const client = getPrismaClient();
  if (!client) return false;
  try {
    const existing = await client.actionCompletion.findUnique({
      where: {
        actionId_dayId: { actionId, dayId },
      },
    });

    if (existing) {
      await client.actionCompletion.update({
        where: { id: existing.id },
        data: { status: 'skipped', note },
      });
    } else {
      await client.actionCompletion.create({
        data: {
          actionId,
          dayId,
          status: 'skipped',
          note,
        },
      });
    }

    logger.info('Action marked as skipped', { actionId, dayId });
    return true;
  } catch (error) {
    logger.error('Failed to mark action skipped', { actionId, dayId, error });
    return false;
  }
}

/**
 * Get action completions for a day
 */
export async function getActionCompletionsForDay(
  dayId: string
): Promise<Array<{ actionId: string; status: string; note: string | null }>> {
  const client = getPrismaClient();
  if (!client) return [];
  try {
    const completions = await client.actionCompletion.findMany({
      where: { dayId },
      select: { actionId: true, status: true, note: true },
    });
    return completions;
  } catch (error) {
    logger.error('Failed to get action completions for day', { dayId, error });
    return [];
  }
}
