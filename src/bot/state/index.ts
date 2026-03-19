import { logger } from '../../utils/logger.js';
import { StateManager } from './manager.js';
import { RedisStateManager } from './redis.js';
import { InMemoryStateManager } from './memory.js';
import {
  UserState,
  UserFSMState,
  HelloMessageType,
  DecisionMessageType,
  OnboardingMessageType,
  OnboardingSubstate,
  ChatMessageHistory,
  BUTTON_TTL_MS
} from './types.js';

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
// FSM STATE MANAGEMENT
// ============================================================

/**
 * Set user FSM state
 */
export async function setFSMState(
  userId: number,
  fsmState: UserFSMState
): Promise<void> {
  const manager = getStateManager();
  let state = await manager.get(userId);
  
  if (!state) {
    state = {
      fsmState,
      lastTimestamp: Date.now()
    };
  } else {
    state = {
      ...state,
      fsmState,
      lastTimestamp: Date.now()
    };
  }
  
  await manager.set(userId, state);
  logger.debug('FSM state set', { userId, fsmState });
}

/**
 * Get user FSM state
 */
export async function getFSMState(userId: number): Promise<UserFSMState | null> {
  const manager = getStateManager();
  const state = await manager.get(userId);
  
  if (!state) return null;
  
  // Migration: convert legacy state to new format
  if (!state.fsmState && state.lastMessageType) {
    return UserFSMState.STATE_HELLO;
  }
  
  return state.fsmState || null;
}

/**
 * Transition from HELLO to DECISION
 */
export async function transitionHelloToDecision(userId: number): Promise<void> {
  await setFSMState(userId, UserFSMState.STATE_DECISION);
  
  // Reset decision message counter
  const manager = getStateManager();
  let state = await manager.get(userId);
  if (state) {
    state.decisionMessage = undefined;
    await manager.set(userId, state);
  }
  
  logger.info('Transitioned to DECISION state', { userId });
}

/**
 * Transition from DECISION to ONBOARDING
 */
export async function transitionDecisionToOnboarding(userId: number): Promise<void> {
  await setFSMState(userId, UserFSMState.STATE_ONBOARDING);
  logger.info('Transitioned to ONBOARDING state', { userId });
}

/**
 * Set last decision message for a user
 */
export async function setLastDecisionMessage(
  userId: number,
  messageType: DecisionMessageType,
  messageId?: number
): Promise<void> {
  const manager = getStateManager();
  let state = await manager.get(userId);
  
  if (!state) {
    state = {
      fsmState: UserFSMState.STATE_DECISION,
      decisionMessage: messageType,
      lastMessageId: messageId,
      lastTimestamp: Date.now()
    };
  } else {
    state = {
      ...state,
      fsmState: UserFSMState.STATE_DECISION,
      decisionMessage: messageType,
      lastMessageId: messageId,
      lastTimestamp: Date.now()
    };
  }

  await manager.set(userId, state);
  logger.debug('Decision message set', { userId, messageType, messageId });
}

/**
 * Get last decision message for a user
 */
export async function getLastDecisionMessage(userId: number): Promise<{
  decisionMessage: DecisionMessageType;
  lastMessageId?: number;
} | null> {
  const manager = getStateManager();
  const state = await manager.get(userId);
  
  if (!state || !state.decisionMessage) return null;
  
  return {
    decisionMessage: state.decisionMessage,
    lastMessageId: state.lastMessageId
  };
}

/**
 * Set last hello message for a user
 */
export async function setLastHelloMessage(
  userId: number,
  messageType: HelloMessageType,
  messageId?: number
): Promise<void> {
  const manager = getStateManager();
  let state = await manager.get(userId);
  
  if (!state) {
    state = {
      fsmState: UserFSMState.STATE_HELLO,
      helloMessage: messageType,
      lastMessageId: messageId,
      lastTimestamp: Date.now()
    };
  } else {
    state = {
      ...state,
      fsmState: UserFSMState.STATE_HELLO,
      helloMessage: messageType,
      lastMessageId: messageId,
      lastTimestamp: Date.now()
    };
    // Update legacy field for backward compatibility
    state.lastMessageType = messageType;
  }

  await manager.set(userId, state);
  logger.debug('Hello message set', { userId, messageType, messageId });
}

/**
 * Get last hello message for a user
 */
export async function getLastHelloMessage(userId: number): Promise<{
  helloMessage: HelloMessageType;
  lastMessageId?: number;
} | null> {
  const manager = getStateManager();
  const state = await manager.get(userId);
  
  if (!state) return null;
  
  // Try new field first, then fall back to legacy
  const helloMessage = state.helloMessage || state.lastMessageType;
  
  if (!helloMessage) return null;
  
  return {
    helloMessage: helloMessage as HelloMessageType,
    lastMessageId: state.lastMessageId
  };
}

// ============================================================
// LEGACY EXPORTS (for backward compatibility with handlers)
// These will be removed in future refactoring
// ============================================================

/**
 * Set last message info for a user
 * @deprecated Use setLastHelloMessage() instead
 */
export async function setLastMessage(
  userId: number,
  messageType: OnboardingMessageType,
  messageId?: number
): Promise<void> {
  await setLastHelloMessage(userId, messageType, messageId);
}

/**
 * Get last message info for a user
 * @deprecated Use getLastHelloMessage() instead
 */
export async function getLastMessage(userId: number): Promise<UserState | undefined> {
  const manager = getStateManager();
  const state = await manager.get(userId);
  return state || undefined;
}

/**
 * Reset user state (used for /start)
 */
export async function resetState(userId: number): Promise<void> {
  const manager = getStateManager();
  await manager.reset(userId);
  
  // Set initial FSM state
  await setFSMState(userId, UserFSMState.STATE_HELLO);
  
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

  // Get current message type (try new field first, then legacy)
  const currentMessageType = state.helloMessage || state.lastMessageType;
  
  if (!currentMessageType) {
    logger.warn('Callback validation failed - no message type in state', { userId });
    return false;
  }

  // Check if callback message type matches current state
  if (currentMessageType !== callbackMessageType) {
    logger.warn('Callback validation failed - message type mismatch', {
      userId,
      currentType: currentMessageType,
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
 * Validate decision callback data
 */
export async function validateDecisionCallback(
  userId: number,
  callbackMessageType: DecisionMessageType,
  callbackTimestamp: number
): Promise<boolean> {
  const manager = getStateManager();
  const state = await manager.get(userId);

  // No state found - invalid
  if (!state) {
    logger.warn('Decision callback validation failed - no state found', { userId });
    return false;
  }

  // Check FSM state
  if (state.fsmState !== UserFSMState.STATE_DECISION) {
    logger.warn('Decision callback validation failed - wrong FSM state', {
      userId,
      fsmState: state.fsmState
    });
    return false;
  }

  // Get current decision message type
  const currentMessageType = state.decisionMessage;
  
  if (!currentMessageType) {
    logger.warn('Decision callback validation failed - no decision message in state', { userId });
    return false;
  }

  // Check if callback message type matches current state
  if (currentMessageType !== callbackMessageType) {
    logger.warn('Decision callback validation failed - message type mismatch', {
      userId,
      currentType: currentMessageType,
      callbackType: callbackMessageType
    });
    return false;
  }

  // Check if callback is expired
  const now = Date.now();
  if (now - callbackTimestamp > BUTTON_TTL_MS) {
    logger.warn('Decision callback validation failed - expired', {
      userId,
      callbackTimestamp,
      now
    });
    return false;
  }

  logger.debug('Decision callback validated successfully', { userId, messageType: callbackMessageType });
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
 * Get next decision message type
 */
export function getNextDecisionMessageType(current: DecisionMessageType): DecisionMessageType | null {
  const next = current + 1;
  return next <= 2 ? (next as DecisionMessageType) : null;
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

// ============================================================
// ONBOARDING STATE MANAGEMENT (STATE_ONBOARDING)
// ============================================================

/**
 * Initialize STATE_ONBOARDING with Vision substate
 */
export async function initOnboardingVision(userId: number): Promise<void> {
  const manager = getStateManager();
  let state = await manager.get(userId);
  
  if (!state) {
    state = {
      fsmState: UserFSMState.STATE_ONBOARDING,
      onboardingSubstate: OnboardingSubstate.VISION,
      visionMessageCount: 0,
      visionChatHistory: [],
      lastTimestamp: Date.now(),
    };
  } else {
    state = {
      ...state,
      fsmState: UserFSMState.STATE_ONBOARDING,
      onboardingSubstate: OnboardingSubstate.VISION,
      visionMessageCount: 0,
      visionChatHistory: [],
      lastTimestamp: Date.now(),
    };
  }

  await manager.set(userId, state);
  logger.info('Initialized ONBOARDING Vision substate', { userId });
}

/**
 * Get full user state
 */
export async function getState(userId: number): Promise<UserState | null> {
  const manager = getStateManager();
  return manager.get(userId);
}

/**
 * Increment Vision message count
 */
export async function incrementVisionMessageCount(userId: number): Promise<number> {
  const manager = getStateManager();
  const state = await manager.get(userId);
  
  if (!state) return 0;
  
  const newCount = (state.visionMessageCount || 0) + 1;
  
  state.visionMessageCount = newCount;
  state.lastTimestamp = Date.now();
  
  await manager.set(userId, state);
  return newCount;
}

/**
 * Add message to Vision chat history
 */
export async function addVisionChatMessage(
  userId: number,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const manager = getStateManager();
  const state = await manager.get(userId);
  
  if (!state) return;
  
  if (!state.visionChatHistory) {
    state.visionChatHistory = [];
  }
  
  state.visionChatHistory.push({ role, content });
  state.lastTimestamp = Date.now();
  
  await manager.set(userId, state);
}

/**
 * Save accepted Vision
 */
export async function saveVision(userId: number, vision: string): Promise<void> {
  const manager = getStateManager();
  const state = await manager.get(userId);
  
  if (!state) return;
  
  state.vision = vision;
  // Note: onboardingSubstate will change to GOALS in future task
  state.lastTimestamp = Date.now();
  
  await manager.set(userId, state);
  logger.info('Vision saved', { userId, visionLength: vision.length });
}

/**
 * Get Vision state info
 */
export async function getVisionState(userId: number): Promise<{
  messageCount: number;
  chatHistory: ChatMessageHistory[];
} | null> {
  const manager = getStateManager();
  const state = await manager.get(userId);
  
  if (!state || state.fsmState !== UserFSMState.STATE_ONBOARDING) {
    return null;
  }
  
  return {
    messageCount: state.visionMessageCount || 0,
    chatHistory: state.visionChatHistory || [],
  };
}

// Re-export types
export { UserFSMState, OnboardingSubstate } from './types.js';
export type { OnboardingMessageType, HelloMessageType, DecisionMessageType, UserState, ChatMessageHistory } from './types.js';
