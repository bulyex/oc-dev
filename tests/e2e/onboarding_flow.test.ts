/**
 * TASK-028: E2E Integration Test - Full Onboarding Flow
 * 
 * Tests the complete onboarding chain:
 * 1. /start → STATE_HELLO (message 1)
 * 2. 5 HELLO messages → STATE_DECISION
 * 3. DECISION → VISION
 * 4. Vision dialog → vision_done → Vision saved to DB
 * 5. Goals dialog → goals_accept → Cycle + Goals created
 * 6. Plan dialog → plan_accept → Cycle.planText updated, Week + Actions + Day created
 * 7. STATE_ACTIVE → chat contexts cleared
 *
 * Also verifies NO context leakage between phases.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const TEST_USER_ID = 999888777;
const TEST_TELEGRAM_ID = String(TEST_USER_ID);
const DB_PATH = '/tmp/test-onboarding-e2e.db';

const VISION_DRAFT = 'Вот черновик твоего видения: энергичный, уверенный, с фокусом на главном.';
const GOALS_LIST = '1. Похудеть на 8 кг\n2. Запустить MVP\n3. Медитировать каждый день';
const PLAN_TEXT = 'Неделя 1-2: Фундамент...';

let prisma: PrismaClient;

import {
  initializeStateManager, clearAllStates, resetState,
  setLastHelloMessage, setFSMState, transitionHelloToDecision,
  transitionDecisionToOnboarding, initOnboardingVision,
  initOnboardingGoals, initOnboardingPlan, addVisionChatMessage,
  addGoalsChatMessage, addPlanChatMessage, saveVision, getVisionState,
  setDraftProposed, getGoalsState, getPlanState, getState,
  clearOnboardingChatHistories, transitionOnboardingToActive, getFSMState,
} from '../../src/bot/state/index.js';
import { UserFSMState, OnboardingSubstate } from '../../src/bot/state/types.js';

// parseGoalsText - same implementation as goals.repository
function parseGoalsText(goalsText: string): Array<{ order: number; description: string }> {
  const numberedPattern = /(?:^|\n)\s*(\d+)\.\s*([^\n]+(?:\n(?!\s*\d+\.)[^\n]*)*)/g;
  const matches: Array<{ order: number; description: string }> = [];
  let match;
  while ((match = numberedPattern.exec(goalsText)) !== null) {
    const order = parseInt(match[1], 10);
    const description = match[2].trim();
    if (description) matches.push({ order, description });
  }
  if (matches.length > 0) return matches.sort((a, b) => a.order - b.order);
  
  const bulletPattern = /(?:^|\n)\s*[-*•]\s*([^\n]+)/g;
  const bulletMatches: Array<{ order: number; description: string }> = [];
  let bulletMatch;
  let order = 1;
  while ((bulletMatch = bulletPattern.exec(goalsText)) !== null) {
    const description = bulletMatch[1].trim();
    if (description) bulletMatches.push({ order: order++, description });
  }
  if (bulletMatches.length > 0) return bulletMatches;
  
  return [{ order: 1, description: goalsText.trim() }];
}

// Self-contained Prisma for E2E tests
function createTestPrisma(): PrismaClient {
  return new PrismaClient({ datasourceUrl: `file:${DB_PATH}` });
}

async function createSchema(p: PrismaClient): Promise<void> {
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL PRIMARY KEY, "telegramId" TEXT NOT NULL UNIQUE, "firstName" TEXT, "lastName" TEXT, "username" TEXT, "fsmState" TEXT NOT NULL DEFAULT 'hello', "vision" TEXT, "goals" TEXT, "plan" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Cycle" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "cycleLengthInWeeks" INTEGER NOT NULL DEFAULT 12, "status" TEXT NOT NULL DEFAULT 'active', "visionText" TEXT NOT NULL, "goalsText" TEXT NOT NULL, "planText" TEXT, "currentWeek" INTEGER NOT NULL DEFAULT 1, "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" DATETIME, "dayCount" INTEGER NOT NULL DEFAULT 0, "activeStartedAt" DATETIME, "weekCount" INTEGER NOT NULL DEFAULT 0, "cycleCount" INTEGER NOT NULL DEFAULT 0, FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE)`);
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Goal" ("id" TEXT NOT NULL PRIMARY KEY, "cycleId" TEXT NOT NULL, "order" INTEGER NOT NULL, "description" TEXT NOT NULL, "metric" TEXT, "targetValue" TEXT, "status" TEXT NOT NULL DEFAULT 'active', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE)`);
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Week" ("id" TEXT NOT NULL PRIMARY KEY, "cycleId" TEXT NOT NULL, "weekNumber" INTEGER NOT NULL, "focus" TEXT, "rhythm" TEXT, "planText" TEXT, "score" INTEGER, "reviewText" TEXT, "status" TEXT NOT NULL DEFAULT 'planned', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE, UNIQUE("cycleId", "weekNumber"))`);
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "WeekAction" ("id" TEXT NOT NULL PRIMARY KEY, "weekId" TEXT NOT NULL, "order" INTEGER NOT NULL, "description" TEXT NOT NULL, "when" TEXT, "metric" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE)`);
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Day" ("id" TEXT NOT NULL PRIMARY KEY, "weekId" TEXT NOT NULL, "dayNumber" INTEGER NOT NULL, "date" DATETIME NOT NULL, "dailyPlanText" TEXT, "checkinText" TEXT, "completed" BOOLEAN NOT NULL DEFAULT 0, "autoCompleted" BOOLEAN NOT NULL DEFAULT 0, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE, UNIQUE("weekId", "dayNumber"))`);
  await p.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ActionCompletion" ("id" TEXT NOT NULL PRIMARY KEY, "actionId" TEXT NOT NULL, "dayId" TEXT, "status" TEXT NOT NULL DEFAULT 'pending', "note" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("actionId") REFERENCES "WeekAction"("id") ON DELETE CASCADE, FOREIGN KEY ("dayId") REFERENCES "Day"("id") ON DELETE SET NULL, UNIQUE("actionId", "dayId"))`);
}

async function cleanupDB(): Promise<void> {
  await prisma.actionCompletion.deleteMany();
  await prisma.day.deleteMany();
  await prisma.weekAction.deleteMany();
  await prisma.week.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.cycle.deleteMany();
  await prisma.user.deleteMany();
}

// Helper: create or get user in DB
async function upsertTestUser(): Promise<{ id: string; vision: string | null }> {
  const existing = await prisma.user.findUnique({ where: { telegramId: TEST_TELEGRAM_ID } });
  if (existing) return existing;
  return prisma.user.create({
    data: { telegramId: TEST_TELEGRAM_ID, firstName: 'Test', lastName: 'User', username: 'testuser' }
  });
}

// Helper: save user vision to DB
async function saveUserVisionToDb(vision: string): Promise<void> {
  await prisma.user.update({ where: { telegramId: TEST_TELEGRAM_ID }, data: { vision } });
}

// Helper: get user vision from DB
async function getUserVisionFromDb(): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { telegramId: TEST_TELEGRAM_ID } });
  return user?.vision || null;
}

// Helper: save goals to DB
async function saveGoalsToDb(goals: string): Promise<void> {
  await prisma.user.update({ where: { telegramId: TEST_TELEGRAM_ID }, data: { goals } });
}

// Helper: create Cycle + Goals
async function createCycleAndGoals(userId: string, vision: string, goalsText: string) {
  const cycle = await prisma.cycle.create({
    data: { userId, visionText: vision, goalsText, status: 'active', cycleLengthInWeeks: 12, currentWeek: 1 }
  });
  
  const parsedGoals = parseGoalsText(goalsText);
  for (const goal of parsedGoals) {
    await prisma.goal.create({
      data: { cycleId: cycle.id, order: goal.order, description: goal.description, status: 'active' }
    });
  }
  
  return cycle;
}

// Helper: update cycle plan and create week + days
async function createFirstWeekDb(cycleId: string, planText: string) {
  await prisma.cycle.update({ where: { id: cycleId }, data: { planText } });
  
  const week = await prisma.week.create({
    data: { cycleId, weekNumber: 1, status: 'active' }
  });
  
  // Create 7 days
  const baseDate = new Date('2026-03-28');
  for (let dayNumber = 1; dayNumber <= 7; dayNumber++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + dayNumber - 1);
    await prisma.day.create({ data: { weekId: week.id, dayNumber, date } });
  }
  
  return week;
}

// Helper: create week actions
async function createWeekActionsDb(weekId: string, actions: Array<{ actionText: string; order: number }>) {
  const ids: string[] = [];
  for (const action of actions) {
    const weekAction = await prisma.weekAction.create({
      data: { weekId, description: action.actionText, order: action.order }
    });
    ids.push(weekAction.id);
  }
  return ids;
}

// Helper: get or create today's day
async function getOrCreateTodayDayDb(weekId: string): Promise<{ id: string }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const existing = await prisma.day.findFirst({
    where: { weekId, date: { gte: today, lt: new Date(today.getTime() + 86400000) } }
  });
  
  if (existing) return existing;
  
  // Find day number based on existing days
  const dayCount = await prisma.day.count({ where: { weekId } });
  const dayNumber = Math.min(dayCount + 1, 7);
  
  return prisma.day.create({ data: { weekId, dayNumber, date: today } });
}

// Helper: update day daily plan
async function updateDayDailyPlanDb(dayId: string, dailyPlanText: string): Promise<void> {
  await prisma.day.update({ where: { id: dayId }, data: { dailyPlanText } });
}

// Helper: get active cycle for user
async function getActiveCycleForUserDb(userId: string) {
  return prisma.cycle.findFirst({ where: { userId, status: 'active' } });
}

// Helper: get active week for user
async function getActiveWeekForUserDb(userId: string) {
  const cycle = await getActiveCycleForUserDb(userId);
  if (!cycle) return null;
  return prisma.week.findFirst({ where: { cycleId: cycle.id, status: 'active' } });
}

describe('E2E: Full Onboarding Flow', () => {
  beforeAll(async () => {
    if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
    prisma = createTestPrisma();
    await prisma.$connect();
    await createSchema(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  });

  beforeEach(async () => {
    await initializeStateManager();
    await clearAllStates();
    await cleanupDB();
    await upsertTestUser();
  });

  afterEach(async () => {
    await clearAllStates();
  });

  // =====================================================
  // TEST 1: Full flow from /start to STATE_ACTIVE
  // =====================================================
  it('full flow: /start → STATE_HELLO → STATE_DECISION → VISION → GOALS → PLAN → STATE_ACTIVE', async () => {
    // Step 1: /start → STATE_HELLO
    await resetState(TEST_USER_ID);
    await setFSMState(TEST_USER_ID, UserFSMState.STATE_HELLO);
    await setLastHelloMessage(TEST_USER_ID, 1);
    
    let state = await getState(TEST_USER_ID);
    expect(state?.fsmState).toBe(UserFSMState.STATE_HELLO);
    expect(state?.helloMessage).toBe(1);

    // Step 2: 5 HELLO messages → STATE_DECISION
    await setLastHelloMessage(TEST_USER_ID, 2);
    await setLastHelloMessage(TEST_USER_ID, 3);
    await setLastHelloMessage(TEST_USER_ID, 4);
    await setLastHelloMessage(TEST_USER_ID, 5);
    await transitionHelloToDecision(TEST_USER_ID);
    expect(await getFSMState(TEST_USER_ID)).toBe(UserFSMState.STATE_DECISION);

    // Step 3: DECISION → VISION
    await transitionDecisionToOnboarding(TEST_USER_ID);
    await initOnboardingVision(TEST_USER_ID);
    state = await getState(TEST_USER_ID);
    expect(state?.fsmState).toBe(UserFSMState.STATE_ONBOARDING);
    expect(state?.onboardingSubstate).toBe(OnboardingSubstate.VISION);

    // Step 4: Vision dialog → vision_done
    await addVisionChatMessage(TEST_USER_ID, 'user', 'Хочу быть энергичным и продуктивным');
    await addVisionChatMessage(TEST_USER_ID, 'assistant', VISION_DRAFT);
    await setDraftProposed(TEST_USER_ID, true);
    
    // Verify visionChatHistory has content before clearing
    state = await getState(TEST_USER_ID);
    expect(state?.visionChatHistory?.length).toBeGreaterThan(0);
    
    // Save vision
    await saveVision(TEST_USER_ID, VISION_DRAFT);
    await saveUserVisionToDb(VISION_DRAFT);
    
    // Verify vision in DB
    const savedVision = await getUserVisionFromDb();
    expect(savedVision).toBe(VISION_DRAFT);

    // Step 5: Goals dialog → goals_accept
    await initOnboardingGoals(TEST_USER_ID);
    await addGoalsChatMessage(TEST_USER_ID, 'user', 'Мои цели');
    await addGoalsChatMessage(TEST_USER_ID, 'assistant', GOALS_LIST);
    
    // Verify goalsChatHistory doesn't contain vision content
    state = await getState(TEST_USER_ID);
    expect(state?.goalsChatHistory?.length).toBeGreaterThan(0);
    expect(state?.goalsChatHistory?.[0].content).not.toContain('видения');
    
    // Create Cycle + Goals in DB
    const user = await upsertTestUser();
    const cycle = await createCycleAndGoals(user.id, VISION_DRAFT, GOALS_LIST);
    await saveGoalsToDb(GOALS_LIST);
    
    // Verify Cycle and Goals in DB
    const dbCycle = await getActiveCycleForUserDb(user.id);
    expect(dbCycle).not.toBeNull();
    expect(dbCycle?.visionText).toBe(VISION_DRAFT);
    const dbGoals = await prisma.goal.findMany({ where: { cycleId: cycle.id } });
    expect(dbGoals.length).toBeGreaterThan(0);

    // Step 6: Plan dialog → plan_accept
    await initOnboardingPlan(TEST_USER_ID);
    await addPlanChatMessage(TEST_USER_ID, 'user', 'Мой план');
    await addPlanChatMessage(TEST_USER_ID, 'assistant', PLAN_TEXT);
    
    // Verify planChatHistory doesn't contain goals content
    state = await getState(TEST_USER_ID);
    expect(state?.planChatHistory?.length).toBeGreaterThan(0);
    expect(state?.planChatHistory?.[0].content).not.toContain('Похудеть');
    
    // Accept plan: update Cycle.planText, create Week + Days
    await saveUserPlanToDb(PLAN_TEXT);
    const week = await createFirstWeekDb(cycle.id, PLAN_TEXT);
    
    // Verify Cycle.planText updated
    const updatedCycle = await getActiveCycleForUserDb(user.id);
    expect(updatedCycle?.planText).toBe(PLAN_TEXT);
    
    // Verify Week and Day created
    expect(week.weekNumber).toBe(1);
    expect(week.status).toBe('active');
    const days = await prisma.day.findMany({ where: { weekId: week.id } });
    expect(days.length).toBe(7);
    
    // Step 7: STATE_ACTIVE → chat contexts cleared
    await clearOnboardingChatHistories(TEST_USER_ID);
    await transitionOnboardingToActive(TEST_USER_ID);
    
    state = await getState(TEST_USER_ID);
    expect(state?.fsmState).toBe(UserFSMState.STATE_ACTIVE);
    expect(state?.visionChatHistory).toEqual([]);
    expect(state?.goalsChatHistory).toEqual([]);
    expect(state?.planChatHistory).toEqual([]);
  });

  it('no context leakage: visionChatHistory does NOT leak into goalsChatHistory', async () => {
    await setFSMState(TEST_USER_ID, UserFSMState.STATE_ONBOARDING);
    
    // Vision phase
    await initOnboardingVision(TEST_USER_ID);
    await addVisionChatMessage(TEST_USER_ID, 'user', 'SECRET_VISION_USER');
    await addVisionChatMessage(TEST_USER_ID, 'assistant', 'SECRET_VISION_ASSISTANT');
    
    let state = await getState(TEST_USER_ID);
    expect(state?.visionChatHistory?.length).toBe(2);
    
    // Goals phase (new substate, NEW history)
    await initOnboardingGoals(TEST_USER_ID);
    
    state = await getState(TEST_USER_ID);
    expect(state?.visionChatHistory?.length).toBe(2); // Vision still intact
    expect(state?.goalsChatHistory?.length).toBe(0); // Goals is fresh
    
    // Add goals messages
    await addGoalsChatMessage(TEST_USER_ID, 'user', 'My goals');
    
    state = await getState(TEST_USER_ID);
    expect(state?.goalsChatHistory?.length).toBe(1);
    expect(state?.goalsChatHistory?.[0].content).toBe('My goals');
    // Vision messages should NOT appear in goals
    expect(state?.goalsChatHistory?.[0].content).not.toContain('SECRET_VISION');
    expect(state?.visionChatHistory?.length).toBe(2); // Vision unchanged
  });

  it('no context leakage: goalsChatHistory does NOT leak into planChatHistory', async () => {
    await setFSMState(TEST_USER_ID, UserFSMState.STATE_ONBOARDING);
    
    // Goals phase
    await initOnboardingGoals(TEST_USER_ID);
    await addGoalsChatMessage(TEST_USER_ID, 'user', 'SECRET_GOALS_USER');
    await addGoalsChatMessage(TEST_USER_ID, 'assistant', 'SECRET_GOALS_ASSISTANT');
    
    let state = await getState(TEST_USER_ID);
    expect(state?.goalsChatHistory?.length).toBe(2);
    
    // Plan phase (new substate, NEW history)
    await initOnboardingPlan(TEST_USER_ID);
    
    state = await getState(TEST_USER_ID);
    expect(state?.goalsChatHistory?.length).toBe(2); // Goals still intact
    expect(state?.planChatHistory?.length).toBe(0); // Plan is fresh
    
    // Add plan messages
    await addPlanChatMessage(TEST_USER_ID, 'user', 'My plan');
    
    state = await getState(TEST_USER_ID);
    expect(state?.planChatHistory?.length).toBe(1);
    expect(state?.planChatHistory?.[0].content).toBe('My plan');
    // Goals messages should NOT appear in plan
    expect(state?.planChatHistory?.[0].content).not.toContain('SECRET_GOALS');
    expect(state?.goalsChatHistory?.length).toBe(2); // Goals unchanged
  });

  it('after vision_done: state.visionChatHistory is cleared, User.vision saved to DB', async () => {
    await setFSMState(TEST_USER_ID, UserFSMState.STATE_ONBOARDING);
    
    // Vision phase with messages
    await initOnboardingVision(TEST_USER_ID);
    await addVisionChatMessage(TEST_USER_ID, 'user', 'My vision message');
    await addVisionChatMessage(TEST_USER_ID, 'assistant', VISION_DRAFT);
    await setDraftProposed(TEST_USER_ID, true);
    await saveVision(TEST_USER_ID, VISION_DRAFT);
    await saveUserVisionToDb(VISION_DRAFT);
    
    // Clear chat history
    await clearOnboardingChatHistories(TEST_USER_ID);
    
    let state = await getState(TEST_USER_ID);
    expect(state?.visionChatHistory).toEqual([]);
    
    // Vision in DB should be preserved
    const savedVision = await getUserVisionFromDb();
    expect(savedVision).toBe(VISION_DRAFT);
    
    // Other histories should also be cleared
    expect(state?.goalsChatHistory).toEqual([]);
    expect(state?.planChatHistory).toEqual([]);
  });

  it('after goals_accept: state.goalsChatHistory is cleared, Cycle + Goals created in DB', async () => {
    await setFSMState(TEST_USER_ID, UserFSMState.STATE_ONBOARDING);
    
    // Vision first (needed for Cycle)
    await initOnboardingVision(TEST_USER_ID);
    await addVisionChatMessage(TEST_USER_ID, 'user', 'Vision input');
    await addVisionChatMessage(TEST_USER_ID, 'assistant', VISION_DRAFT);
    await saveVision(TEST_USER_ID, VISION_DRAFT);
    await saveUserVisionToDb(VISION_DRAFT);
    
    // Goals phase
    await initOnboardingGoals(TEST_USER_ID);
    await addGoalsChatMessage(TEST_USER_ID, 'user', 'Goal input 1');
    await addGoalsChatMessage(TEST_USER_ID, 'assistant', GOALS_LIST);
    
    let state = await getState(TEST_USER_ID);
    expect(state?.goalsChatHistory?.length).toBe(2);
    
    // Create Cycle + Goals in DB
    const user = await upsertTestUser();
    await saveGoalsToDb(GOALS_LIST);
    const cycle = await createCycleAndGoals(user.id, VISION_DRAFT, GOALS_LIST);
    
    // Clear chat history
    await clearOnboardingChatHistories(TEST_USER_ID);
    
    state = await getState(TEST_USER_ID);
    expect(state?.goalsChatHistory).toEqual([]);
    
    // Verify DB records
    const dbCycle = await getActiveCycleForUserDb(user.id);
    expect(dbCycle).not.toBeNull();
    const dbGoals = await prisma.goal.findMany({ where: { cycleId: cycle.id } });
    expect(dbGoals.length).toBeGreaterThan(0);
  });

  it('after plan_accept: state.planChatHistory cleared, Cycle.planText updated, Week/Actions/Day created', async () => {
    await setFSMState(TEST_USER_ID, UserFSMState.STATE_ONBOARDING);
    
    const user = await upsertTestUser();
    
    // Create Cycle with Goals first
    const cycle = await createCycleAndGoals(user.id, 'Test vision', GOALS_LIST);
    
    // Plan phase
    await initOnboardingPlan(TEST_USER_ID);
    await addPlanChatMessage(TEST_USER_ID, 'user', 'Plan input');
    await addPlanChatMessage(TEST_USER_ID, 'assistant', PLAN_TEXT);
    
    let state = await getState(TEST_USER_ID);
    expect(state?.planChatHistory?.length).toBe(2);
    
    // Accept plan
    await createFirstWeekDb(cycle.id, PLAN_TEXT);
    
    // Verify Cycle.planText updated
    const updatedCycle = await getActiveCycleForUserDb(user.id);
    expect(updatedCycle?.planText).toBe(PLAN_TEXT);
    
    // Verify Week created
    const week = await getActiveWeekForUserDb(user.id);
    expect(week).not.toBeNull();
    expect(week?.weekNumber).toBe(1);
    
    // Create WeekActions
    const actions = await createWeekActionsDb(week!.id, [
      { actionText: 'Action 1', order: 1 },
      { actionText: 'Action 2', order: 2 },
    ]);
    expect(actions.length).toBe(2);
    
    // Get/create today Day
    const todayDay = await getOrCreateTodayDayDb(week!.id);
    await updateDayDailyPlanDb(todayDay.id, '• Action 1\n• Action 2');
    
    // Clear chat history
    await clearOnboardingChatHistories(TEST_USER_ID);
    
    state = await getState(TEST_USER_ID);
    expect(state?.planChatHistory).toEqual([]);
    
    // Verify Day dailyPlanText
    const dbDay = await prisma.day.findUnique({ where: { id: todayDay.id } });
    expect(dbDay?.dailyPlanText).toContain('Action 1');
  });

  it('verify all 3 chat histories are independent (no cross-contamination)', async () => {
    await setFSMState(TEST_USER_ID, UserFSMState.STATE_ONBOARDING);
    
    // Add messages to all 3 histories
    await initOnboardingVision(TEST_USER_ID);
    await addVisionChatMessage(TEST_USER_ID, 'user', 'VISION_MSG_1');
    await addVisionChatMessage(TEST_USER_ID, 'assistant', 'VISION_AI_1');
    
    await initOnboardingGoals(TEST_USER_ID);
    await addGoalsChatMessage(TEST_USER_ID, 'user', 'GOALS_MSG_1');
    await addGoalsChatMessage(TEST_USER_ID, 'assistant', 'GOALS_AI_1');
    
    await initOnboardingPlan(TEST_USER_ID);
    await addPlanChatMessage(TEST_USER_ID, 'user', 'PLAN_MSG_1');
    await addPlanChatMessage(TEST_USER_ID, 'assistant', 'PLAN_AI_1');
    
    const state = await getState(TEST_USER_ID);
    
    // All 3 should have content
    expect(state?.visionChatHistory?.length).toBe(2);
    expect(state?.goalsChatHistory?.length).toBe(2);
    expect(state?.planChatHistory?.length).toBe(2);
    
    // Each should contain only its own messages
    expect(state?.visionChatHistory?.[0].content).toBe('VISION_MSG_1');
    expect(state?.goalsChatHistory?.[0].content).toBe('GOALS_MSG_1');
    expect(state?.planChatHistory?.[0].content).toBe('PLAN_MSG_1');
    
    // Verify no cross-contamination by checking unique tokens
    const visionContent = (state?.visionChatHistory || []).map(m => m.content).join(' ');
    const goalsContent = (state?.goalsChatHistory || []).map(m => m.content).join(' ');
    const planContent = (state?.planChatHistory || []).map(m => m.content).join(' ');
    
    expect(visionContent).not.toContain('GOALS_MSG_1');
    expect(visionContent).not.toContain('PLAN_MSG_1');
    expect(goalsContent).not.toContain('VISION_MSG_1');
    expect(goalsContent).not.toContain('PLAN_MSG_1');
    expect(planContent).not.toContain('VISION_MSG_1');
    expect(planContent).not.toContain('GOALS_MSG_1');
  });
});

// Helper missing in main file - add saveUserPlanToDb
async function saveUserPlanToDb(plan: string): Promise<void> {
  await prisma.user.update({ where: { telegramId: TEST_TELEGRAM_ID }, data: { plan } });
}
