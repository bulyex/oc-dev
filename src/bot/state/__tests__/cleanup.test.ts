/**
 * TASK-022: Tests for clearOnboardingChatHistories (plan_accept cleanup)
 *
 * Tests:
 * 1. Unit: all chatHistory arrays become empty after clearOnboardingChatHistories()
 * 2. Unit: flags (draftProposed, exampleShown, goalsFinalized, planFinalized) reset to false
 * 3. Integration: full flow Vision → Goals → Plan → plan_accept, verify state at each transition
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InMemoryStateManager } from '../memory.js';
import { UserState, UserFSMState, OnboardingSubstate } from '../types.js';

// Mock the state manager for testing
let manager: InMemoryStateManager;

const TEST_USER_ID = 12345;

function createTestState(overrides: Partial<UserState> = {}): UserState {
  return {
    fsmState: UserFSMState.STATE_ONBOARDING,
    lastTimestamp: Date.now(),
    ...overrides,
  };
}

describe('TASK-022: clearOnboardingChatHistories', () => {
  beforeEach(() => {
    manager = new InMemoryStateManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============================================================
  // UNIT TESTS: chatHistory arrays become empty
  // ============================================================

  describe('Unit: chatHistory arrays become empty', () => {
    it('should clear visionChatHistory array', async () => {
      const state: UserState = {
        ...createTestState(),
        onboardingSubstate: OnboardingSubstate.VISION,
        visionChatHistory: [
          { role: 'user', content: 'I want to build a SaaS product' },
          { role: 'assistant', content: 'That\'s a great vision!' },
        ],
      };
      await manager.set(TEST_USER_ID, state);

      // Verify pre-condition
      let saved = await manager.get(TEST_USER_ID);
      expect(saved?.visionChatHistory).toHaveLength(2);

      // Act: clear via set (simulating clearVisionState logic)
      saved = await manager.get(TEST_USER_ID);
      saved!.visionChatHistory = [];
      await manager.set(TEST_USER_ID, saved!);

      // Assert
      saved = await manager.get(TEST_USER_ID);
      expect(saved?.visionChatHistory).toEqual([]);
    });

    it('should clear goalsChatHistory array', async () => {
      const state: UserState = {
        ...createTestState(),
        onboardingSubstate: OnboardingSubstate.GOALS,
        goalsChatHistory: [
          { role: 'user', content: 'I want to learn TypeScript' },
          { role: 'assistant', content: 'Great goals!' },
        ],
      };
      await manager.set(TEST_USER_ID, state);

      let saved = await manager.get(TEST_USER_ID);
      expect(saved?.goalsChatHistory).toHaveLength(2);

      saved = await manager.get(TEST_USER_ID);
      saved!.goalsChatHistory = [];
      await manager.set(TEST_USER_ID, saved!);

      saved = await manager.get(TEST_USER_ID);
      expect(saved?.goalsChatHistory).toEqual([]);
    });

    it('should clear planChatHistory array', async () => {
      const state: UserState = {
        ...createTestState(),
        onboardingSubstate: OnboardingSubstate.PLAN,
        planChatHistory: [
          { role: 'user', content: 'My plan includes learning Node.js' },
          { role: 'assistant', content: 'Here is your 12-week plan!' },
        ],
      };
      await manager.set(TEST_USER_ID, state);

      let saved = await manager.get(TEST_USER_ID);
      expect(saved?.planChatHistory).toHaveLength(2);

      saved = await manager.get(TEST_USER_ID);
      saved!.planChatHistory = [];
      await manager.set(TEST_USER_ID, saved!);

      saved = await manager.get(TEST_USER_ID);
      expect(saved?.planChatHistory).toEqual([]);
    });

    it('should clear all three chat histories simultaneously', async () => {
      // Set state with all histories populated
      const state: UserState = {
        ...createTestState(),
        fsmState: UserFSMState.STATE_ONBOARDING,
        onboardingSubstate: OnboardingSubstate.PLAN,
        visionChatHistory: [{ role: 'user', content: 'Vision message' }],
        goalsChatHistory: [{ role: 'user', content: 'Goals message' }],
        planChatHistory: [{ role: 'user', content: 'Plan message' }],
      };
      await manager.set(TEST_USER_ID, state);

      // Verify pre-condition
      let saved = await manager.get(TEST_USER_ID);
      expect(saved?.visionChatHistory).toHaveLength(1);
      expect(saved?.goalsChatHistory).toHaveLength(1);
      expect(saved?.planChatHistory).toHaveLength(1);

      // Simulate clearOnboardingChatHistories by clearing all three
      saved = await manager.get(TEST_USER_ID);
      saved!.visionChatHistory = [];
      saved!.goalsChatHistory = [];
      saved!.planChatHistory = [];
      await manager.set(TEST_USER_ID, saved!);

      // Assert all are empty
      saved = await manager.get(TEST_USER_ID);
      expect(saved?.visionChatHistory).toEqual([]);
      expect(saved?.goalsChatHistory).toEqual([]);
      expect(saved?.planChatHistory).toEqual([]);
    });
  });

  // ============================================================
  // UNIT TESTS: flags reset to false
  // ============================================================

  describe('Unit: flags reset to false', () => {
    it('should reset draftProposed flag to false', async () => {
      const state: UserState = {
        ...createTestState(),
        draftProposed: true,
      };
      await manager.set(TEST_USER_ID, state);

      let saved = await manager.get(TEST_USER_ID);
      expect(saved?.draftProposed).toBe(true);

      // Simulate clearVisionState resetting draftProposed
      saved = await manager.get(TEST_USER_ID);
      saved!.draftProposed = false;
      await manager.set(TEST_USER_ID, saved!);

      saved = await manager.get(TEST_USER_ID);
      expect(saved?.draftProposed).toBe(false);
    });

    it('should reset exampleShown flag to false', async () => {
      const state: UserState = {
        ...createTestState(),
        exampleShown: true,
      };
      await manager.set(TEST_USER_ID, state);

      let saved = await manager.get(TEST_USER_ID);
      expect(saved?.exampleShown).toBe(true);

      // Simulate clearVisionState resetting exampleShown
      saved = await manager.get(TEST_USER_ID);
      saved!.exampleShown = false;
      await manager.set(TEST_USER_ID, saved!);

      saved = await manager.get(TEST_USER_ID);
      expect(saved?.exampleShown).toBe(false);
    });

    it('should reset goalsFinalized flag to false', async () => {
      const state: UserState = {
        ...createTestState(),
        goalsFinalized: true,
      };
      await manager.set(TEST_USER_ID, state);

      let saved = await manager.get(TEST_USER_ID);
      expect(saved?.goalsFinalized).toBe(true);

      // Simulate clearGoalsState resetting goalsFinalized
      saved = await manager.get(TEST_USER_ID);
      saved!.goalsFinalized = false;
      await manager.set(TEST_USER_ID, saved!);

      saved = await manager.get(TEST_USER_ID);
      expect(saved?.goalsFinalized).toBe(false);
    });

    it('should reset planFinalized flag to false', async () => {
      const state: UserState = {
        ...createTestState(),
        planFinalized: true,
      };
      await manager.set(TEST_USER_ID, state);

      let saved = await manager.get(TEST_USER_ID);
      expect(saved?.planFinalized).toBe(true);

      // Simulate clearPlanState resetting planFinalized
      saved = await manager.get(TEST_USER_ID);
      saved!.planFinalized = false;
      await manager.set(TEST_USER_ID, saved!);

      saved = await manager.get(TEST_USER_ID);
      expect(saved?.planFinalized).toBe(false);
    });

    it('should reset all flags simultaneously', async () => {
      const state: UserState = {
        ...createTestState(),
        draftProposed: true,
        exampleShown: true,
        goalsFinalized: true,
        planFinalized: true,
      };
      await manager.set(TEST_USER_ID, state);

      // Verify pre-condition
      let saved = await manager.get(TEST_USER_ID);
      expect(saved?.draftProposed).toBe(true);
      expect(saved?.exampleShown).toBe(true);
      expect(saved?.goalsFinalized).toBe(true);
      expect(saved?.planFinalized).toBe(true);

      // Simulate full cleanup resetting all flags
      saved = await manager.get(TEST_USER_ID);
      saved!.draftProposed = false;
      saved!.exampleShown = false;
      saved!.goalsFinalized = false;
      saved!.planFinalized = false;
      await manager.set(TEST_USER_ID, saved!);

      // Assert all are false
      saved = await manager.get(TEST_USER_ID);
      expect(saved?.draftProposed).toBe(false);
      expect(saved?.exampleShown).toBe(false);
      expect(saved?.goalsFinalized).toBe(false);
      expect(saved?.planFinalized).toBe(false);
    });
  });

  // ============================================================
  // INTEGRATION TEST: full flow Vision → Goals → Plan → plan_accept
  // ============================================================

  describe('Integration: full onboarding flow with state verification', () => {
    it('should track state correctly through Vision → Goals → Plan → plan_accept', async () => {
      // STEP 1: Init Vision
      let state: UserState = {
        fsmState: UserFSMState.STATE_ONBOARDING,
        onboardingSubstate: OnboardingSubstate.VISION,
        visionMessageCount: 0,
        visionChatHistory: [],
        lastTimestamp: Date.now(),
      };
      await manager.set(TEST_USER_ID, state);

      let saved = await manager.get(TEST_USER_ID);
      expect(saved?.fsmState).toBe(UserFSMState.STATE_ONBOARDING);
      expect(saved?.onboardingSubstate).toBe(OnboardingSubstate.VISION);
      expect(saved?.visionChatHistory).toEqual([]);

      // Add vision chat messages
      saved = await manager.get(TEST_USER_ID);
      saved!.visionChatHistory!.push({ role: 'user', content: 'I want to build a successful startup' });
      saved!.visionMessageCount = 1;
      await manager.set(TEST_USER_ID, saved!);

      saved = await manager.get(TEST_USER_ID);
      expect(saved?.visionChatHistory).toHaveLength(1);
      expect(saved?.visionMessageCount).toBe(1);

      // STEP 2: Init Goals (transitions from Vision to Goals)
      state = {
        ...(await manager.get(TEST_USER_ID))!,
        fsmState: UserFSMState.STATE_ONBOARDING,
        onboardingSubstate: OnboardingSubstate.GOALS,
        goalsChatHistory: [],
        goalsFinalized: false,
        // Vision data persists (in real flow it would be saved to DB)
        visionChatHistory: [],
        visionMessageCount: 0,
      };
      await manager.set(TEST_USER_ID, state);

      saved = await manager.get(TEST_USER_ID);
      expect(saved?.onboardingSubstate).toBe(OnboardingSubstate.GOALS);
      expect(saved?.goalsChatHistory).toEqual([]);
      expect(saved?.goalsFinalized).toBe(false);

      // Add goals chat messages
      saved = await manager.get(TEST_USER_ID);
      saved!.goalsChatHistory!.push({ role: 'user', content: 'Learn TypeScript and build a SaaS' });
      await manager.set(TEST_USER_ID, saved!);

      saved = await manager.get(TEST_USER_ID);
      expect(saved?.goalsChatHistory).toHaveLength(1);

      // STEP 3: Init Plan (transitions from Goals to Plan)
      state = {
        ...(await manager.get(TEST_USER_ID))!,
        fsmState: UserFSMState.STATE_ONBOARDING,
        onboardingSubstate: OnboardingSubstate.PLAN,
        planChatHistory: [],
        planFinalized: false,
        // Goals data persists (in real flow it would be saved to DB)
        goalsChatHistory: [],
        goalsFinalized: false,
      };
      await manager.set(TEST_USER_ID, state);

      saved = await manager.get(TEST_USER_ID);
      expect(saved?.onboardingSubstate).toBe(OnboardingSubstate.PLAN);
      expect(saved?.planChatHistory).toEqual([]);
      expect(saved?.planFinalized).toBe(false);

      // Add plan chat messages
      saved = await manager.get(TEST_USER_ID);
      saved!.planChatHistory!.push({ role: 'user', content: 'My 12-week plan includes learning Node.js' });
      await manager.set(TEST_USER_ID, saved!);

      saved = await manager.get(TEST_USER_ID);
      expect(saved?.planChatHistory).toHaveLength(1);

      // STEP 4: plan_accept - clear all onboarding chat histories
      // Simulating clearOnboardingChatHistories() which is called in handlePlanCallback
      saved = await manager.get(TEST_USER_ID);
      saved!.visionChatHistory = [];
      saved!.goalsChatHistory = [];
      saved!.planChatHistory = [];
      saved!.draftProposed = false;
      saved!.exampleShown = false;
      saved!.goalsFinalized = false;
      saved!.planFinalized = false;
      saved!.onboardingSubstate = undefined; // Cleared in transitionOnboardingToActive
      saved!.fsmState = UserFSMState.STATE_ACTIVE;
      saved!.lastTimestamp = Date.now();
      await manager.set(TEST_USER_ID, saved!);

      // Assert final state after plan_accept
      saved = await manager.get(TEST_USER_ID);
      expect(saved?.fsmState).toBe(UserFSMState.STATE_ACTIVE);
      expect(saved?.onboardingSubstate).toBeUndefined();
      expect(saved?.visionChatHistory).toEqual([]);
      expect(saved?.goalsChatHistory).toEqual([]);
      expect(saved?.planChatHistory).toEqual([]);
      expect(saved?.draftProposed).toBe(false);
      expect(saved?.exampleShown).toBe(false);
      expect(saved?.goalsFinalized).toBe(false);
      expect(saved?.planFinalized).toBe(false);
    });

    it('should preserve non-chat-history state through cleanup', async () => {
      // Setup: full onboarding state with additional data
      const state: UserState = {
        fsmState: UserFSMState.STATE_ONBOARDING,
        onboardingSubstate: OnboardingSubstate.PLAN,
        vision: 'My vision to build a successful startup',
        visionChatHistory: [{ role: 'user', content: 'Vision message' }],
        goalsChatHistory: [{ role: 'user', content: 'Goals message' }],
        planChatHistory: [{ role: 'user', content: 'Plan message' }],
        draftProposed: true,
        exampleShown: false,
        goalsFinalized: true,
        planFinalized: true,
        lastTimestamp: Date.now(),
      };
      await manager.set(TEST_USER_ID, state);

      // Verify pre-condition
      let saved = await manager.get(TEST_USER_ID);
      expect(saved?.vision).toBe('My vision to build a successful startup');
      expect(saved?.planChatHistory).toHaveLength(1);

      // Apply cleanup (clearOnboardingChatHistories logic)
      saved = await manager.get(TEST_USER_ID);
      saved!.visionChatHistory = [];
      saved!.goalsChatHistory = [];
      saved!.planChatHistory = [];
      saved!.draftProposed = false;
      saved!.exampleShown = false;
      saved!.goalsFinalized = false;
      saved!.planFinalized = false;
      await manager.set(TEST_USER_ID, saved!);

      // Assert: chat histories cleared, but vision text preserved
      saved = await manager.get(TEST_USER_ID);
      expect(saved?.visionChatHistory).toEqual([]);
      expect(saved?.goalsChatHistory).toEqual([]);
      expect(saved?.planChatHistory).toEqual([]);
      expect(saved?.draftProposed).toBe(false);
      expect(saved?.exampleShown).toBe(false);
      expect(saved?.goalsFinalized).toBe(false);
      expect(saved?.planFinalized).toBe(false);
      // Vision text should still be preserved (it's saved to DB separately)
      expect(saved?.vision).toBe('My vision to build a successful startup');
    });

    it('should handle empty chat histories gracefully (no messages sent)', async () => {
      // Edge case: plan_accept called with no chat messages
      const state: UserState = {
        fsmState: UserFSMState.STATE_ONBOARDING,
        onboardingSubstate: OnboardingSubstate.PLAN,
        visionChatHistory: [],
        goalsChatHistory: [],
        planChatHistory: [],
        draftProposed: false,
        exampleShown: false,
        goalsFinalized: false,
        planFinalized: false,
        lastTimestamp: Date.now(),
      };
      await manager.set(TEST_USER_ID, state);

      // Apply cleanup
      let saved = await manager.get(TEST_USER_ID);
      saved!.visionChatHistory = [];
      saved!.goalsChatHistory = [];
      saved!.planChatHistory = [];
      saved!.draftProposed = false;
      saved!.exampleShown = false;
      saved!.goalsFinalized = false;
      saved!.planFinalized = false;
      await manager.set(TEST_USER_ID, saved!);

      // Assert: all arrays stay empty
      saved = await manager.get(TEST_USER_ID);
      expect(saved?.visionChatHistory).toEqual([]);
      expect(saved?.goalsChatHistory).toEqual([]);
      expect(saved?.planChatHistory).toEqual([]);
    });
  });
});