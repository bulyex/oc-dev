import { StateManager } from './manager.js';
import { UserState } from './types.js';
import { logger } from '../../utils/logger.js';

/**
 * In-Memory State Manager
 * Used as fallback when Redis is not available (degraded mode)
 *
 * Implements TTL (time-to-live) to prevent memory leaks:
 * - Stores expiry timestamp for each entry
 * - Performs lazy cleanup on get() - expired entries return null
 * - Provides explicit cleanup() method for batch removal of expired entries
 * - Entries without TTL (or TTL=0) are stored indefinitely
 */
interface StoredEntry {
  state: UserState;
  expiresAt: number | null; // null = no expiry (permanent)
}

export class InMemoryStateManager implements StateManager {
  private stateMap = new Map<number, StoredEntry>();

  async get(userId: number): Promise<UserState | null> {
    const entry = this.stateMap.get(userId);
    
    // No entry found
    if (!entry) {
      return null;
    }

    // Check if entry has expired
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      // Lazy cleanup: remove expired entry
      this.stateMap.delete(userId);
      logger.debug('User state expired and removed from memory', { userId });
      return null;
    }

    return entry.state;
  }

  async set(userId: number, state: UserState, ttl?: number): Promise<void> {
    // Calculate expiry timestamp
    // - ttl is in seconds (per StateManager interface)
    // - TTL=0 or undefined means no expiry (permanent storage)
    const expiresAt: number | null = (ttl && ttl > 0) 
      ? Date.now() + (ttl * 1000)
      : null;

    this.stateMap.set(userId, { state, expiresAt });
    
    logger.debug('User state saved to memory (degraded mode)', { 
      userId, 
      messageType: state.lastMessageType,
      ttl: ttl ?? 'none'
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
   * Remove all expired entries from memory.
   * Called automatically on get() (lazy cleanup), but can be invoked manually
   * for batch cleanup to reduce memory usage without accessing specific entries.
   * 
   * @returns Number of entries removed
   */
  cleanup(): number {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [userId, entry] of this.stateMap.entries()) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.stateMap.delete(userId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.info(`Memory cleanup removed ${removedCount} expired entries`);
    }

    return removedCount;
  }

  /**
   * Clear all states (useful for testing)
   */
  clear(): void {
    this.stateMap.clear();
    logger.info('All user states cleared from memory');
  }
}
