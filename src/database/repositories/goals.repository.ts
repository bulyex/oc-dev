import { getPrismaClient } from '../client.js';
import { logger } from '../../utils/logger.js';

/**
 * Parse goals text into individual goals
 * Supports numbered list (1., 2., 3.) and bullet markers (-, *, •)
 * Falls back to single goal if parsing fails
 */
export function parseGoalsText(goalsText: string): Array<{ order: number; description: string }> {
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

  // Try bullet markers: -, *, •
  const bulletPattern = /(?:^|\n)\s*[-*•]\s*([^\n]+)/g;
  const bulletMatches: Array<{ order: number; description: string }> = [];
  let bulletMatch;
  let order = 1;

  while ((bulletMatch = bulletPattern.exec(goalsText)) !== null) {
    const description = bulletMatch[1].trim();
    if (description) {
      bulletMatches.push({ order: order++, description });
    }
  }

  if (bulletMatches.length > 0) {
    return bulletMatches;
  }

  // Fallback: single goal with full text
  return [{ order: 1, description: goalsText.trim() }];
}

/**
 * Create Goal[] records from goalsText
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
 * Get goals for a cycle
 */
export async function getGoalsForCycle(
  cycleId: string
): Promise<Array<{ id: string; order: number; description: string; status: string }>> {
  const client = getPrismaClient();
  if (!client) return [];
  try {
    const goals = await client.goal.findMany({
      where: { cycleId },
      select: { id: true, order: true, description: true, status: true },
      orderBy: { order: 'asc' },
    });
    return goals;
  } catch (error) {
    logger.error('Failed to get goals for cycle', { cycleId, error });
    return [];
  }
}

/**
 * Update goal status
 */
export async function updateGoalStatus(
  goalId: string,
  status: 'active' | 'completed' | 'paused'
): Promise<boolean> {
  const client = getPrismaClient();
  if (!client) return false;
  try {
    await client.goal.update({
      where: { id: goalId },
      data: { status },
    });
    logger.info('Goal status updated', { goalId, status });
    return true;
  } catch (error) {
    logger.error('Failed to update goal status', { goalId, error });
    return false;
  }
}
