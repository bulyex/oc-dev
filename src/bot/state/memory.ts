import { StateManager } from './manager.js';
import { UserState } from './types.js';
import { logger } from '../../utils/logger.js';

/**
 * In-Memory State Manager
 * Used as fallback when Redis is not available (degraded mode)
 */
export class InMemoryStateManager implements StateManager {
  private stateMap = new Map<number, UserState>();

  async get(userId: number): Promise<UserState | null> {
    const state = this.stateMap.get(userId);
    return state || null;
  }

  async set(userId: number, state: UserState, _ttl?: number): Promise<void> {
    // Note: In-memory doesn't actually respect TTL (acceptable for degraded mode)
    this.stateMap.set(userId, state);
    logger.debug('User state saved to memory (degraded mode)', { 
      userId, 
      messageType: state.lastMessageType 
    });
  }

  async delete(userId: number): Promise<void> {
    this.stateMap.delete(userId);
    logger.debug('User state deleted from memory', { userId });
  }

  async reset(userId: number): Promise<void> {
    await this.delete(userId);
  }

  /**
   * Clear all states (useful for testing)
   */
  clear(): void {
    this.stateMap.clear();
    logger.info('All user states cleared from memory');
  }
}
