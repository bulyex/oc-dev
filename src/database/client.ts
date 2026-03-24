import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { hasDatabase } from '../config/index.js';

let prisma: PrismaClient | null = null;
let prismaConnectPromise: Promise<PrismaClient> | null = null;

function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

/**
 * Get Prisma client with promise-based initialization.
 * Guarantees a single PrismaClient instance with exactly one $connect() call.
 * Concurrent calls return the same promise.
 */
export async function getPrismaClientAsync(): Promise<PrismaClient | null> {
  if (!hasDatabase) {
    logger.warn('DATABASE_URL not configured - running in degraded mode');
    return null;
  }

  // Already connected - return immediately
  if (prisma) {
    return prisma;
  }

  // Connection in progress - return existing promise
  if (prismaConnectPromise) {
    return prismaConnectPromise;
  }

  // Start new connection
  const newClient = createPrismaClient();
  prismaConnectPromise = newClient
    .$connect()
    .then(() => {
      prisma = newClient;
      logger.info('Database connected successfully');
      return prisma;
    })
    .catch((error) => {
      logger.error('Failed to connect to database:', error);
      prismaConnectPromise = null;
      throw error;
    });

  return prismaConnectPromise;
}

/**
 * Get Prisma client synchronously (deprecated: may return null during initial connection).
 * For new code, prefer getPrismaClientAsync().
 */
export function getPrismaClient(): PrismaClient | null {
  return prisma;
}

/**
 * Disconnect database (for graceful shutdown)
 */
export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Database disconnected');
    prisma = null;
    prismaConnectPromise = null;
  }
}

// ============================================================
// Barrel exports for backward compatibility
// Re-export all repository functions so existing imports continue to work
// ============================================================

// User repository
export {
  upsertUser,
  getUserByTelegramId,
  getUserVision,
  saveUserVision,
  getUserGoals,
  saveUserGoals,
  getUserPlan,
  saveUserPlan,
  deleteUser,
  getUserStatus,
} from './repositories/user.repository.js';

// Cycle repository
export {
  createCycle,
  getActiveCycleForUser,
  updateCyclePlan,
  completeCycle,
} from './repositories/cycle.repository.js';

// Week repository
export {
  createFirstWeek,
  getActiveWeekForUser,
  getOrCreateTodayDay,
  getOrCreateWeek,
  updateDayDailyPlan,
} from './repositories/week.repository.js';

// Goals repository
export {
  parseGoalsText,
  createGoals,
  getGoalsForCycle,
  updateGoalStatus,
} from './repositories/goals.repository.js';

// Action repository
export {
  createWeekActions,
  getWeekActions,
  markActionDone,
  markActionSkipped,
  getActionCompletionsForDay,
  type TodayAction,
} from './repositories/action.repository.js';

// Execution repository
export {
  getTodayStatus,
  getTodayActionsWithCompletions,
  type TodayStatus,
} from './repositories/execution.repository.js';

// FSM repository
export { syncFSMState, getFSMStateFromDB } from './repositories/fsm.repository.js';
