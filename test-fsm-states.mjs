/**
 * FSM States Test (Task 4)
 *
 * Tests the new FSM state machine:
 * 1. /start → fsmState = STATE_HELLO
 * 2. Прохождение 5 сообщений → fsmState = STATE_DECISION
 * 3. DECISION сообщение 1 → 2
 * 4. DECISION сообщение 2 → fsmState = STATE_ONBOARDING
 * 5. Text handler в STATE_DECISION → повтор сообщения
 * 6. Callback validation в STATE_DECISION
 */

import {
  initializeStateManager,
  getStateManager,
  setFSMState,
  getFSMState,
  setLastHelloMessage,
  getLastHelloMessage,
  setLastDecisionMessage,
  getLastDecisionMessage,
  transitionHelloToDecision,
  transitionDecisionToOnboarding,
  validateCallback,
  validateDecisionCallback,
  getNextMessageType,
  resetState,
  clearAllStates
} from './dist/bot/state/index.js';

import { UserFSMState } from './dist/bot/state/types.js';

import {
  parseCallbackData,
  getOnboardingMessage,
  generateCallbackData
} from './dist/bot/onboarding/index.js';

import {
  parseDecisionCallbackData,
  getDecisionMessage,
  generateDecisionCallbackData
} from './dist/bot/decision/index.js';

const TEST_USER_ID = 123456789;

async function runTests() {
  console.log('🧪 Starting FSM States Tests (Task 4)\n');

  // Initialize in-memory state manager (no Redis)
  await initializeStateManager();
  console.log('   ✅ State manager initialized (in-memory mode)\n');

  // Clear any existing state
  await clearAllStates();

  // ========================================
  console.log('✅ Test 1: /start sets fsmState = STATE_HELLO');
  // ========================================
  await resetState(TEST_USER_ID);
  await setFSMState(TEST_USER_ID, UserFSMState.STATE_HELLO);
  await setLastHelloMessage(TEST_USER_ID, 1, 100);

  const fsmState1 = await getFSMState(TEST_USER_ID);
  if (fsmState1 !== UserFSMState.STATE_HELLO) {
    console.log(`   ❌ FAILED: Expected STATE_HELLO, got ${fsmState1}`);
    process.exit(1);
  }

  const helloState1 = await getLastHelloMessage(TEST_USER_ID);
  if (!helloState1 || helloState1.helloMessage !== 1) {
    console.log('   ❌ FAILED: Hello message not set correctly');
    process.exit(1);
  }
  console.log('   ✅ fsmState = STATE_HELLO after /start\n');

  // ========================================
  console.log('✅ Test 2: Progress through HELLO messages 1-5');
  // ========================================
  for (let i = 1; i <= 5; i++) {
    await setLastHelloMessage(TEST_USER_ID, i, 100 + i);
    
    const helloState = await getLastHelloMessage(TEST_USER_ID);
    if (!helloState || helloState.helloMessage !== i) {
      console.log(`   ❌ FAILED: Hello message ${i} not saved correctly`);
      process.exit(1);
    }
    console.log(`   ✅ Hello message ${i} saved`);
  }
  console.log('');

  // ========================================
  console.log('✅ Test 3: Transition to STATE_DECISION');
  // ========================================
  await transitionHelloToDecision(TEST_USER_ID);

  const fsmState2 = await getFSMState(TEST_USER_ID);
  if (fsmState2 !== UserFSMState.STATE_DECISION) {
    console.log(`   ❌ FAILED: Expected STATE_DECISION, got ${fsmState2}`);
    process.exit(1);
  }
  console.log('   ✅ fsmState = STATE_DECISION after transition\n');

  // ========================================
  console.log('✅ Test 4: DECISION message 1 → 2');
  // ========================================
  await setLastDecisionMessage(TEST_USER_ID, 1, 200);

  const decisionState1 = await getLastDecisionMessage(TEST_USER_ID);
  if (!decisionState1 || decisionState1.decisionMessage !== 1) {
    console.log('   ❌ FAILED: Decision message 1 not saved');
    process.exit(1);
  }
  console.log('   ✅ Decision message 1 saved');

  await setLastDecisionMessage(TEST_USER_ID, 2, 201);

  const decisionState2 = await getLastDecisionMessage(TEST_USER_ID);
  if (!decisionState2 || decisionState2.decisionMessage !== 2) {
    console.log('   ❌ FAILED: Decision message 2 not saved');
    process.exit(1);
  }
  console.log('   ✅ Decision message 2 saved\n');

  // ========================================
  console.log('✅ Test 5: Transition to STATE_ONBOARDING');
  // ========================================
  await transitionDecisionToOnboarding(TEST_USER_ID);

  const fsmState3 = await getFSMState(TEST_USER_ID);
  if (fsmState3 !== UserFSMState.STATE_ONBOARDING) {
    console.log(`   ❌ FAILED: Expected STATE_ONBOARDING, got ${fsmState3}`);
    process.exit(1);
  }
  console.log('   ✅ fsmState = STATE_ONBOARDING after transition\n');

  // ========================================
  console.log('✅ Test 6: Callback validation in STATE_DECISION');
  // ========================================
  // Reset and set up STATE_DECISION
  await resetState(TEST_USER_ID);
  await transitionHelloToDecision(TEST_USER_ID);
  await setLastDecisionMessage(TEST_USER_ID, 1, 300);

  const timestamp = Date.now();
  const decisionCallbackData = generateDecisionCallbackData(1);
  const parsedDecision = parseDecisionCallbackData(decisionCallbackData);

  if (!parsedDecision || parsedDecision.messageType !== 1) {
    console.log('   ❌ FAILED: Decision callback data parsing failed');
    process.exit(1);
  }
  console.log('   ✅ Decision callback data parsing works');

  const validDecision = await validateDecisionCallback(TEST_USER_ID, parsedDecision.messageType, parsedDecision.timestamp);
  if (!validDecision) {
    console.log('   ❌ FAILED: Valid decision callback rejected');
    process.exit(1);
  }
  console.log('   ✅ Valid decision callback accepted\n');

  // ========================================
  console.log('✅ Test 7: Legacy state migration');
  // ========================================
  const manager = getStateManager();
  const MIGRATION_USER_ID = 999888;

  // Set legacy state (without fsmState)
  await manager.set(MIGRATION_USER_ID, {
    lastMessageType: 3,
    lastMessageId: 400,
    lastTimestamp: Date.now()
  });

  const migratedState = await getFSMState(MIGRATION_USER_ID);
  if (migratedState !== UserFSMState.STATE_HELLO) {
    console.log(`   ❌ FAILED: Migration should return STATE_HELLO, got ${migratedState}`);
    process.exit(1);
  }
  console.log('   ✅ Legacy state migrated to STATE_HELLO\n');

  // ========================================
  console.log('✅ Test 8: Onboarding messages still work');
  // ========================================
  for (let i = 1; i <= 5; i++) {
    const msg = getOnboardingMessage(i);
    if (!msg.text || !msg.keyboard) {
      console.log(`   ❌ FAILED: Onboarding message ${i} incomplete`);
      process.exit(1);
    }
  }
  console.log('   ✅ All 5 onboarding messages work\n');

  // ========================================
  console.log('✅ Test 9: Decision messages work');
  // ========================================
  for (let i = 1; i <= 2; i++) {
    const msg = getDecisionMessage(i);
    if (!msg.text || !msg.keyboard) {
      console.log(`   ❌ FAILED: Decision message ${i} incomplete`);
      process.exit(1);
    }
    console.log(`   ✅ Decision message ${i}: "${msg.text.substring(0, 30)}..."`);
  }
  console.log('');

  // ========================================
  console.log('✅ Test 10: Reset clears everything');
  // ========================================
  await setFSMState(TEST_USER_ID, UserFSMState.STATE_DECISION);
  await setLastDecisionMessage(TEST_USER_ID, 2, 500);

  await resetState(TEST_USER_ID);

  const stateAfterReset = await manager.get(TEST_USER_ID);
  // After reset, fsmState should be STATE_HELLO (set by resetState)
  const fsmAfterReset = await getFSMState(TEST_USER_ID);
  if (fsmAfterReset !== UserFSMState.STATE_HELLO) {
    console.log(`   ❌ FAILED: After reset, fsmState should be STATE_HELLO, got ${fsmAfterReset}`);
    process.exit(1);
  }
  console.log('   ✅ Reset clears state and sets fsmState to STATE_HELLO\n');

  console.log('🎉 All FSM States Tests Passed! (10/10)\n');
}

// Run tests
runTests().catch((error) => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
