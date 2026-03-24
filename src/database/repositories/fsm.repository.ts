import { getPrismaClient } from '../client.js';
import { logger } from '../../utils/logger.js';

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
 * Get FSM state from database
 */
export async function getFSMStateFromDB(telegramId: string): Promise<string | null> {
  const client = getPrismaClient();
  if (!client) return null;
  try {
    const user = await client.user.findUnique({
      where: { telegramId },
      select: { fsmState: true },
    });
    return user?.fsmState || null;
  } catch (error) {
    logger.error('Failed to get FSM state from database', { telegramId, error });
    return null;
  }
}
