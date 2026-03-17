import Redis from 'ioredis';
import { StateManager } from './manager.js';
import { UserState, DEFAULT_TTL_SECONDS } from './types.js';
import { logger } from '../../utils/logger.js';

/**
 * Redis-backed State Manager
 * Provides persistent state storage with automatic expiration
 */
export class RedisStateManager implements StateManager {
  private redis;
  private keyPrefix = 'slowfire:user:';
  private defaultTTL: number;

  constructor(redisUrl: string, ttlSeconds?: number) {
    this.defaultTTL = ttlSeconds || DEFAULT_TTL_SECONDS;
    this.redis = new (Redis as any)(redisUrl, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      lazyConnect: true
    });

    this.redis.on('connect', () => {
      logger.info('Redis connected');
    });

    this.redis.on('ready', () => {
      logger.info('Redis ready');
    });

    this.redis.on('error', (err: Error) => {
      logger.error('Redis error:', { error: err.message });
    });

    this.redis.on('close', () => {
      logger.warn('Redis connection closed');
    });

    this.redis.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });
  }

  private getKey(userId: number): string {
    return `${this.keyPrefix}${userId}`;
  }

  async get(userId: number): Promise<UserState | null> {
    try {
      const data = await this.redis.get(this.getKey(userId));
      if (!data) {
        return null;
      }
      return JSON.parse(data) as UserState;
    } catch (error) {
      logger.error('Redis get error:', { userId, error });
      throw error;
    }
  }

  async set(userId: number, state: UserState, ttl = this.defaultTTL): Promise<void> {
    try {
      await this.redis.setex(
        this.getKey(userId),
        ttl,
        JSON.stringify(state)
      );
      logger.debug('User state saved to Redis', { userId, messageType: state.lastMessageType });
    } catch (error) {
      logger.error('Redis set error:', { userId, error });
      throw error;
    }
  }

  async delete(userId: number): Promise<void> {
    try {
      await this.redis.del(this.getKey(userId));
      logger.debug('User state deleted from Redis', { userId });
    } catch (error) {
      logger.error('Redis delete error:', { userId, error });
      throw error;
    }
  }

  async reset(userId: number): Promise<void> {
    await this.delete(userId);
  }

  /**
   * Test connection
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis ping error:', { error });
      return false;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    await this.redis.quit();
    logger.info('Redis disconnected');
  }
}
