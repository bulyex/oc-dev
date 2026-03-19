import { logger } from '../../utils/logger.js';
import { StateManager } from './manager.js';
import { RedisStateManager } from './redis.js';
import { InMemoryStateManager } from './memory.js';
import { UserState, OnboardingMessageType, BUTTON_TTL_MS } from './types.js';

// Global state manager instance
let stateManager: StateManager | null = null;

/**
 * Initialize state manager
 * - Uses Redis if REDIS_URL is configured
 * - Falls back to in-memory if Redis is not available
 */
export async function initializeStateManager(redisUrl?: string): Promise<StateManager> {
  if (stateManager) {
    return stateManager;
  }

  if (!redisUrl) {
    logger.warn('REDIS_URL not set, using in-memory state (degraded mode)');
    stateManager = new InMemoryStateManager();
    return stateManager;
  }

  try {
    const redisManager = new RedisStateManager(redisUrl);
    
    // Test connection
    const isConnected = await redisManager.ping();
    if (!isConnected) {
      throw new Error('Redis ping failed');
    }

    logger.info('Redis state manager initialized');
    stateManager = redisManager;
    return stateManager;
  } catch (error) {
    logger.error('Failed to connect to Redis, falling back to in-memory:', { error });
    stateManager = new InMemoryStateManager();
    return stateManager;
  }
}

/**
 * Get state manager instance
 * Throws if not initialized
 */
export function getStateManager(): StateManager {
  if (!stateManager) {
    throw new Error('StateManager not initialized. Call initializeStateManager() first.');
  }
  return stateManager;
}

/**
 * Shutdown state manager
 */
export async function shutdownStateManager(): Promise<void> {
  if (stateManager && stateManager instanceof RedisStateManager) {
    await stateManager.disconnect();
  }
  stateManager = null;
}

// ============================================================
// LEGACY EXPORTS (for backward compatibility with handlers)
// These will be removed in future refactoring
// ============================================================

/**
 * Set last message info for a user
 * @deprecated Use getStateManager().set() instead
 */
export async function setLastMessage(
  userId: number,
  messageType: OnboardingMessageType,
  messageId?: number
): Promise<void> {
  const manager = getStateManager();
  
  // Get existing state or create new
  let state = await manager.get(userId);
  if (!state) {
    state = {
      lastMessageType: messageType,
      lastMessageId: messageId,
      lastTimestamp: Date.now()
    };
  } else {
    state = {
      ...state,
      lastMessageType: messageType,
      lastMessageId: messageId,
      lastTimestamp: Date.now()
    };
  }

  await manager.set(userId, state);
  logger.debug('User state updated', { userId, messageType, messageId });
}

/**
 * Get last message info for a user
 * @deprecated Use getStateManager().get() instead
 */
export async function getLastMessage(userId: number): Promise<UserState | undefined> {
  const manager = getStateManager();
  const state = await manager.get(userId);
  return state || undefined;
}

/**
 * Reset user state (used for /start)
 * @deprecated Use getStateManager().reset() instead
 */
export async function resetState(userId: number): Promise<void> {
  const manager = getStateManager();
  await manager.reset(userId);
  logger.debug('User state reset', { userId });
}

/**
 * Validate callback data
 * Checks if the callback matches the current user state and is not expired
 * @deprecated Move validation logic to handlers
 */
export async function validateCallback(
  userId: number,
  callbackMessageType: OnboardingMessageType,
  callbackTimestamp: number
): Promise<boolean> {
  const manager = getStateManager();
  const state = await manager.get(userId);

  // No state found - invalid
  if (!state) {
    logger.warn('Callback validation failed - no state found', { userId });
    return false;
  }

  // Check if callback message type matches current state
  if (state.lastMessageType !== callbackMessageType) {
    logger.warn('Callback validation failed - message type mismatch', {
      userId,
      currentType: state.lastMessageType,
      callbackType: callbackMessageType
    });
    return false;
  }

  // Check if callback is expired
  const now = Date.now();
  if (now - callbackTimestamp > BUTTON_TTL_MS) {
    logger.warn('Callback validation failed - expired', {
      userId,
      callbackTimestamp,
      now
    });
    return false;
  }

  // Check if callback timestamp is reasonable (not in future, not too old relative to state)
  if (callbackTimestamp < state.lastTimestamp - BUTTON_TTL_MS) {
    logger.warn('Callback validation failed - timestamp too old', {
      userId,
      callbackTimestamp,
      stateTimestamp: state.lastTimestamp
    });
    return false;
  }

  logger.debug('Callback validated successfully', { userId, messageType: callbackMessageType });
  return true;
}

/**
 * Get next message type in the sequence
 */
export function getNextMessageType(current: OnboardingMessageType): OnboardingMessageType | null {
  const next = current + 1;
  return next <= 5 ? (next as OnboardingMessageType) : null;
}

/**
 * Clear all states (useful for testing)
 */
export async function clearAllStates(): Promise<void> {
  const manager = getStateManager();
  if (manager instanceof InMemoryStateManager) {
    manager.clear();
  } else {
    logger.warn('clearAllStates() not supported for Redis state manager');
  }
}

// Re-export types
export { OnboardingMessageType } from './types.js';
export type { UserState } from './types.js';
