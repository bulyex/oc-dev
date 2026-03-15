import { logger } from '../../utils/logger.js';

// Message types for onboarding flow
export type OnboardingMessageType = 1 | 2 | 3 | 4 | 5;

// User state interface
interface UserState {
  lastMessageType: OnboardingMessageType;
  lastMessageId?: number;
  lastTimestamp: number;
}

// In-memory state storage (Phase 0 - will be replaced with Redis in Phase 1)
const userStateMap = new Map<number, UserState>();

const BUTTON_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Set last message info for a user
 */
export function setLastMessage(
  userId: number,
  messageType: OnboardingMessageType,
  messageId?: number
): void {
  userStateMap.set(userId, {
    lastMessageType: messageType,
    lastMessageId: messageId,
    lastTimestamp: Date.now()
  });

  logger.debug('User state updated', { userId, messageType, messageId });
}

/**
 * Get last message info for a user
 */
export function getLastMessage(userId: number): UserState | undefined {
  return userStateMap.get(userId);
}

/**
 * Reset user state (used for /start)
 */
export function resetState(userId: number): void {
  userStateMap.delete(userId);
  logger.debug('User state reset', { userId });
}

/**
 * Validate callback data
 * Checks if the callback matches the current user state and is not expired
 */
export function validateCallback(
  userId: number,
  callbackMessageType: OnboardingMessageType,
  callbackTimestamp: number
): boolean {
  const state = userStateMap.get(userId);

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
export function clearAllStates(): void {
  userStateMap.clear();
  logger.info('All user states cleared');
}