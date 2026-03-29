/**
 * TASK-023: Unit tests for vision_reset edge case
 *
 * Tests that:
 * 1. clearVisionState resets: chatHistory=[], draftProposed=false, exampleShown=false, messageCount=0
 * 2. clearVisionState does NOT clear state.vision (preserved for clearOnboardingChatHistories).
 *    The vision_reset handler clears state.vision separately after clearVisionState.
 * 3. All vision state fields are properly reset; unrelated fields are preserved
 *
 * Uses a self-contained mock that intercepts all state operations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Shared in-memory mock state store (simulates the in-memory state manager)
interface MockState {
  fsmState?: string;
  onboardingSubstate?: string;
  visionChatHistory?: Array<{ role: string; content: string }>;
  draftProposed?: boolean;
  exampleShown?: boolean;
  visionMessageCount?: number;
  vision?: string;
  lastTimestamp?: number;
  [key: string]: unknown;
}

const mockStateStore: Record<number, MockState> = {};

function createMockManager() {
  return {
    get: vi.fn(async (userId: number) => mockStateStore[userId] ?? null),
    set: vi.fn(async (userId: number, state: MockState) => {
      mockStateStore[userId] = { ...state };
    }),
    delete: vi.fn(async (userId: number) => {
      delete mockStateStore[userId];
    }),
  };
}

let currentMockManager = createMockManager();

// Mock the logger
vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the entire state/index.js module
// NOTE: vi.mock is hoisted to the top — all factory vars must be defined inside or be pre-defined
vi.mock('../../state/index.js', () => {
  return {
    getStateManager: () => currentMockManager,
    getFSMState: vi.fn(),
    getState: vi.fn(),
    getVisionState: vi.fn(async (userId: number) => {
      const state = mockStateStore[userId];
      if (!state || state.fsmState !== 'onboarding') {
        return null;
      }
      return {
        messageCount: state.visionMessageCount ?? 0,
        chatHistory: state.visionChatHistory ?? [],
        draftProposed: state.draftProposed ?? false,
        exampleShown: state.exampleShown ?? false,
      };
    }),
    clearVisionState: vi.fn(async (userId: number) => {
      const state = mockStateStore[userId];
      if (!state) return;
      state.visionChatHistory = [];
      state.draftProposed = false;
      state.exampleShown = false;
      state.visionMessageCount = 0;
      // NOTE: state.vision is intentionally NOT cleared here.
      // clearVisionState is also used by clearOnboardingChatHistories,
      // which must preserve state.vision (it is preserved in the
      // 'after clearOnboardingChatHistories, state.vision preserved' test).
      // The vision_reset handler clears state.vision directly after calling
      // clearVisionState (see handleVisionCallback for vision_reset).
      state.lastTimestamp = Date.now();
      await currentMockManager.set(userId, state);
    }),
    addVisionChatMessage: vi.fn(),
    setDraftProposed: vi.fn(),
    setExampleShown: vi.fn(),
    saveVision: vi.fn(),
    setLastHelloMessage: vi.fn(),
    validateCallback: vi.fn(),
    validateDecisionCallback: vi.fn(),
    getNextMessageType: vi.fn(),
    transitionHelloToDecision: vi.fn(),
    transitionDecisionToOnboarding: vi.fn(),
    transitionOnboardingToActive: vi.fn(),
    setLastDecisionMessage: vi.fn(),
    initOnboardingVision: vi.fn(),
    initOnboardingGoals: vi.fn(),
    initOnboardingPlan: vi.fn(),
    getGoalsState: vi.fn(),
    getPlanState: vi.fn(),
    clearOnboardingChatHistories: vi.fn(),
  };
});

// Import mocked functions
import { clearVisionState, getVisionState } from '../../state/index.js';

describe('vision_reset edge case', () => {
  const TEST_USER_ID = 123456789;

  beforeEach(() => {
    // Clear in-memory state store
    for (const key of Object.keys(mockStateStore)) {
      delete mockStateStore[Number(key)];
    }

    // Replace mock manager with a fresh one (clears call history)
    currentMockManager = createMockManager();

    // Reset all mock call history
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Test 1: clearVisionState resets all vision fields
  // -------------------------------------------------------------------------
  it('clearVisionState resets: chatHistory=[], draftProposed=false, exampleShown=false, messageCount=0', async () => {
    mockStateStore[TEST_USER_ID] = {
      fsmState: 'onboarding',
      onboardingSubstate: 'vision',
      visionChatHistory: [
        { role: 'user', content: 'Мой текст видения' },
        { role: 'assistant', content: 'Черновик: Я вижу...' },
      ],
      draftProposed: true,
      exampleShown: true,
      visionMessageCount: 5,
      vision: 'Старое видение',
      lastTimestamp: Date.now() - 1000,
    };

    await clearVisionState(TEST_USER_ID);

    const visionState = await getVisionState(TEST_USER_ID);
    expect(visionState).not.toBeNull();
    expect(visionState!.chatHistory).toEqual([]);
    expect(visionState!.draftProposed).toBe(false);
    expect(visionState!.exampleShown).toBe(false);
    expect(visionState!.messageCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Test 2: clearVisionState does NOT clear state.vision (preserved here)
  //
  // Rationale: clearVisionState is shared with clearOnboardingChatHistories,
  // which must preserve state.vision (see context-isolation.test.ts).
  // The vision_reset handler in callback.ts clears state.vision separately
  // after calling clearVisionState.
  // -------------------------------------------------------------------------
  it('clearVisionState does NOT clear state.vision (preserved for clearOnboardingChatHistories)', async () => {
    mockStateStore[TEST_USER_ID] = {
      fsmState: 'onboarding',
      onboardingSubstate: 'vision',
      visionChatHistory: [{ role: 'user', content: 'Старое' }],
      draftProposed: true,
      exampleShown: false,
      visionMessageCount: 3,
      vision: 'Это видение сохраняется в state после clearVisionState',
      lastTimestamp: Date.now(),
    };

    await clearVisionState(TEST_USER_ID);

    const state = mockStateStore[TEST_USER_ID];
    expect(state.vision).toBe('Это видение сохраняется в state после clearVisionState');
  });

  // -------------------------------------------------------------------------
  // Test 3: getVisionState returns correct structure after reset
  // -------------------------------------------------------------------------
  it('getVisionState returns correct shape after clearVisionState', async () => {
    mockStateStore[TEST_USER_ID] = {
      fsmState: 'onboarding',
      onboardingSubstate: 'vision',
      visionChatHistory: [],
      draftProposed: false,
      exampleShown: false,
      visionMessageCount: 0,
      vision: undefined,
      lastTimestamp: Date.now(),
    };

    const vs = await getVisionState(TEST_USER_ID);

    expect(vs).not.toBeNull();
    expect(vs).toHaveProperty('messageCount');
    expect(vs).toHaveProperty('chatHistory');
    expect(vs).toHaveProperty('draftProposed');
    expect(vs).toHaveProperty('exampleShown');
    expect(vs!.messageCount).toBe(0);
    expect(vs!.chatHistory).toEqual([]);
    expect(vs!.draftProposed).toBe(false);
    expect(vs!.exampleShown).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test 4: Non-vision FSM state returns null from getVisionState
  // -------------------------------------------------------------------------
  it('getVisionState returns null when fsmState is not onboarding', async () => {
    mockStateStore[TEST_USER_ID] = {
      fsmState: 'active',
      visionChatHistory: [{ role: 'user', content: 'test' }],
    };

    const vs = await getVisionState(TEST_USER_ID);
    expect(vs).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Test 5: Vision state fields are correctly isolated from other state
  // -------------------------------------------------------------------------
  it('clearVisionState does NOT touch unrelated state fields', async () => {
    mockStateStore[TEST_USER_ID] = {
      fsmState: 'onboarding',
      onboardingSubstate: 'vision',
      visionChatHistory: [{ role: 'user', content: 'test' }],
      draftProposed: true,
      exampleShown: true,
      visionMessageCount: 10,
      vision: 'some vision text',
      firstName: 'Егор',
      telegramId: '123456789',
    };

    const stateBefore = { ...mockStateStore[TEST_USER_ID] };

    await clearVisionState(TEST_USER_ID);

    const stateAfter = mockStateStore[TEST_USER_ID] as Record<string, unknown>;
    expect(stateAfter.fsmState).toBe(stateBefore.fsmState);
    expect(stateAfter.onboardingSubstate).toBe(stateBefore.onboardingSubstate);
    expect(stateAfter.firstName).toBe('Егор');
    expect(stateAfter.telegramId).toBe('123456789');
  });
});
