/**
 * TASK-018: Context Isolation and Cleanup Tests
 *
 * Tests:
 * - addVisionChatMessage() writes only to visionChatHistory
 * - addGoalsChatMessage() writes only to goalsChatHistory
 * - addPlanChatMessage() writes only to planChatHistory
 * - clearOnboardingChatHistories() clears all three chat histories
 * - After cleanup, state.vision and onboardingSubstate are preserved
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initializeStateManager,
  clearAllStates,
  initOnboardingVision,
  initOnboardingGoals,
  initOnboardingPlan,
  addVisionChatMessage,
  addGoalsChatMessage,
  addPlanChatMessage,
  clearOnboardingChatHistories,
  saveVision,
  getState,
  setFSMState,
} from '../index.js';
import { UserFSMState, OnboardingSubstate } from '../types.js';

const TEST_USER_ID = 12345;

describe('Context isolation and cleanup', () => {
  beforeEach(async () => {
    // Initialize in-memory state manager (no Redis)
    await initializeStateManager();
    // Clear any existing state
    await clearAllStates();
  });

  afterEach(async () => {
    await clearAllStates();
  });

  it('addVisionChatMessage() writes only to visionChatHistory', async () => {
    await initOnboardingVision(TEST_USER_ID);
    await addVisionChatMessage(TEST_USER_ID, 'user', 'test vision message');

    const state = await getState(TEST_USER_ID);
    expect(state).not.toBeNull();
    expect(state!.visionChatHistory).toHaveLength(1);
    expect(state!.visionChatHistory![0]).toEqual({
      role: 'user',
      content: 'test vision message',
    });
    // Should NOT leak to other histories
    expect(state!.goalsChatHistory).toEqual([]);
    expect(state!.planChatHistory).toEqual([]);
  });

  it('addGoalsChatMessage() writes only to goalsChatHistory', async () => {
    await initOnboardingGoals(TEST_USER_ID);
    await addGoalsChatMessage(TEST_USER_ID, 'assistant', 'goals response');

    const state = await getState(TEST_USER_ID);
    expect(state).not.toBeNull();
    expect(state!.goalsChatHistory).toHaveLength(1);
    expect(state!.goalsChatHistory![0]).toEqual({
      role: 'assistant',
      content: 'goals response',
    });
    // Should NOT leak to other histories
    expect(state!.visionChatHistory).toEqual([]);
    expect(state!.planChatHistory).toEqual([]);
  });

  it('addPlanChatMessage() writes only to planChatHistory', async () => {
    await initOnboardingPlan(TEST_USER_ID);
    await addPlanChatMessage(TEST_USER_ID, 'user', 'plan input');

    const state = await getState(TEST_USER_ID);
    expect(state).not.toBeNull();
    expect(state!.planChatHistory).toHaveLength(1);
    expect(state!.planChatHistory![0]).toEqual({
      role: 'user',
      content: 'plan input',
    });
    // Should NOT leak to other histories
    expect(state!.visionChatHistory).toEqual([]);
    expect(state!.goalsChatHistory).toEqual([]);
  });

  it('clearOnboardingChatHistories() clears all three chat histories', async () => {
    // Populate all three histories
    await initOnboardingVision(TEST_USER_ID);
    await addVisionChatMessage(TEST_USER_ID, 'user', 'vision 1');
    await addVisionChatMessage(TEST_USER_ID, 'assistant', 'vision 2');

    await initOnboardingGoals(TEST_USER_ID);
    await addGoalsChatMessage(TEST_USER_ID, 'user', 'goals 1');
    await addGoalsChatMessage(TEST_USER_ID, 'assistant', 'goals 2');

    await initOnboardingPlan(TEST_USER_ID);
    await addPlanChatMessage(TEST_USER_ID, 'user', 'plan 1');
    await addPlanChatMessage(TEST_USER_ID, 'assistant', 'plan 2');

    // Verify histories have content
    let state = await getState(TEST_USER_ID);
    expect(state!.visionChatHistory).toHaveLength(2);
    expect(state!.goalsChatHistory).toHaveLength(2);
    expect(state!.planChatHistory).toHaveLength(2);

    // Clear all histories
    await clearOnboardingChatHistories(TEST_USER_ID);

    // Verify all cleared
    state = await getState(TEST_USER_ID);
    expect(state!.visionChatHistory).toEqual([]);
    expect(state!.goalsChatHistory).toEqual([]);
    expect(state!.planChatHistory).toEqual([]);
  });

  it('after clearOnboardingChatHistories(), state.vision and onboardingSubstate are preserved', async () => {
    // Setup: create state with vision and onboarding substate
    await initOnboardingVision(TEST_USER_ID);
    await addVisionChatMessage(TEST_USER_ID, 'user', 'my vision text');
    await saveVision(TEST_USER_ID, 'final accepted vision');
    await setFSMState(TEST_USER_ID, UserFSMState.STATE_ONBOARDING);

    // Clear histories
    await clearOnboardingChatHistories(TEST_USER_ID);

    // Verify vision and substate preserved
    const state = await getState(TEST_USER_ID);
    expect(state).not.toBeNull();
    expect(state!.vision).toBe('final accepted vision');
    expect(state!.fsmState).toBe(UserFSMState.STATE_ONBOARDING);
    // Histories should be empty
    expect(state!.visionChatHistory).toEqual([]);
    expect(state!.goalsChatHistory).toEqual([]);
    expect(state!.planChatHistory).toEqual([]);
  });
});
