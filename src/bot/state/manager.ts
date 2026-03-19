import { UserState } from './types.js';

/**
 * State Manager Interface
 * Abstracts state storage mechanism (Redis, in-memory, etc.)
 */
export interface StateManager {
  /**
   * Get user state
   */
  get(userId: number): Promise<UserState | null>;

  /**
   * Set user state with optional TTL (in seconds)
   */
  set(userId: number, state: UserState, ttl?: number): Promise<void>;

  /**
   * Delete user state
   */
  delete(userId: number): Promise<void>;

  /**
   * Reset user state (alias for delete)
   */
  reset(userId: number): Promise<void>;
}
