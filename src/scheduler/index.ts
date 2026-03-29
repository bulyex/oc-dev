import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../utils/logger.js';
import { runDayCounterTask, runWeekCounterTask, runCycleCounterTask } from './tasks/counterTasks.js';

export interface ScheduledJob {
  name: string;
  cronExpression: string;
  handler: () => Promise<void>;
}

interface RegisteredJob extends ScheduledJob {
  task: ScheduledTask;
}

let scheduler: Scheduler | null = null;

export class Scheduler {
  private jobs: Map<string, RegisteredJob> = new Map();
  private started = false;

  /**
   * Register a new cron job.
   * Must be called before start().
   */
  register(name: string, cronExpression: string, handler: () => Promise<void>): void {
    if (this.jobs.has(name)) {
      logger.warn(`Scheduler: job "${name}" already registered, skipping`);
      return;
    }

    if (!cron.validate(cronExpression)) {
      logger.error(`Scheduler: invalid cron expression "${cronExpression}" for job "${name}"`);
      return;
    }

    const task = cron.schedule(cronExpression, async () => {
      const startTime = Date.now();
      logger.info(`Scheduler: starting job "${name}"`);

      try {
        await handler();
        const duration = Date.now() - startTime;
        logger.info(`Scheduler: job "${name}" completed`, { durationMs: duration });
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.error(`Scheduler: job "${name}" failed`, { error, durationMs: duration });
      }
    });

    this.jobs.set(name, { name, cronExpression, handler, task });
    logger.info(`Scheduler: registered job "${name}" with expression "${cronExpression}"`);
  }

  /**
   * Start all registered jobs.
   */
  start(): void {
    if (this.started) {
      logger.warn('Scheduler: already started');
      return;
    }

    this.jobs.forEach((job) => {
      job.task.start();
    });

    this.started = true;
    logger.info(`Scheduler: started ${this.jobs.size} job(s)`);
  }

  /**
   * Stop all registered jobs.
   */
  stop(): void {
    if (!this.started) {
      logger.warn('Scheduler: not started');
      return;
    }

    this.jobs.forEach((job) => {
      job.task.stop();
    });

    this.started = false;
    logger.info('Scheduler: stopped all jobs');
  }
}

/**
 * Get the singleton Scheduler instance.
 */
export function getScheduler(): Scheduler {
  if (!scheduler) {
    scheduler = new Scheduler();
  }
  return scheduler;
}

// Cron expression for 5:00 MSK (Moscow UTC+3)
// node-cron uses UTC, so 5:00 MSK = 2:00 UTC
const CRON_5AM_MSK = '0 2 * * *';

/**
 * Register all counter tasks with the scheduler.
 * Should be called after getScheduler() and before start().
 */
export function registerCounterTasks(): void {
  const s = getScheduler();
  s.register('dayCounterTask', CRON_5AM_MSK, runDayCounterTask);
  s.register('weekCounterTask', CRON_5AM_MSK, runWeekCounterTask);
  s.register('cycleCounterTask', CRON_5AM_MSK, runCycleCounterTask);
}
