/**
 * TASK-021: InMemoryStateManager TTL Tests
 *
 * Tests:
 * - TTL entries expire and return null after TTL expires
 * - TTL entries are cleaned up lazily on get()
 * - Entries without TTL (or TTL=0) persist indefinitely
 * - cleanup() method removes only expired entries
 * - State without TTL is not affected by cleanup()
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InMemoryStateManager } from '../memory.js';
import { UserState, UserFSMState } from '../types.js';

const TEST_USER_ID = 12345;
const SHORT_TTL_SEC = 1; // 1 second for testing TTL

function createTestState(messageType: number = 1): UserState {
  return {
    fsmState: UserFSMState.STATE_HELLO,
    helloMessage: messageType as 1 | 2 | 3 | 4 | 5,
    lastTimestamp: Date.now(),
  };
}

describe('InMemoryStateManager TTL', () => {
  let manager: InMemoryStateManager;

  beforeEach(() => {
    manager = new InMemoryStateManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('TTL expiration', () => {
    it('should return null for expired TTL entry on get()', async () => {
      await manager.set(TEST_USER_ID, createTestState(), SHORT_TTL_SEC);
      
      // Verify state is available initially
      let state = await manager.get(TEST_USER_ID);
      expect(state).not.toBeNull();
      expect(state!.helloMessage).toBe(1);

      // Advance time beyond TTL
      vi.advanceTimersByTime((SHORT_TTL_SEC + 0.5) * 1000);

      // State should now be expired (lazy cleanup on get)
      state = await manager.get(TEST_USER_ID);
      expect(state).toBeNull();
    });

    it('should remove expired entry from storage after get()', async () => {
      await manager.set(TEST_USER_ID, createTestState(), SHORT_TTL_SEC);
      
      vi.advanceTimersByTime((SHORT_TTL_SEC + 0.5) * 1000);
      
      // Trigger lazy cleanup
      await manager.get(TEST_USER_ID);
      
      // Entry should be gone
      const state = await manager.get(TEST_USER_ID);
      expect(state).toBeNull();
    });

    it('should handle multiple TTL entries with different expirations', async () => {
      const userId1 = 1001;
      const userId2 = 1002;
      const userId3 = 1003;

      // Set with different TTLs
      await manager.set(userId1, createTestState(1), 1); // expires at 1s
      await manager.set(userId2, createTestState(2), 5); // expires at 5s
      await manager.set(userId3, createTestState(3), 10); // expires at 10s

      // After 2 seconds: only user1 should be expired
      vi.advanceTimersByTime(2 * 1000);
      expect(await manager.get(userId1)).toBeNull();
      expect(await manager.get(userId2)).not.toBeNull();
      expect(await manager.get(userId3)).not.toBeNull();

      // After 6 more seconds (8s total): user2 should also be expired
      vi.advanceTimersByTime(6 * 1000);
      expect(await manager.get(userId1)).toBeNull();
      expect(await manager.get(userId2)).toBeNull();
      expect(await manager.get(userId3)).not.toBeNull();
    });
  });

  describe('No TTL (permanent entries)', () => {
    it('should persist indefinitely when TTL is undefined', async () => {
      await manager.set(TEST_USER_ID, createTestState());

      // Advance time significantly
      vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 24 hours

      const state = await manager.get(TEST_USER_ID);
      expect(state).not.toBeNull();
      expect(state!.helloMessage).toBe(1);
    });

    it('should persist indefinitely when TTL is 0', async () => {
      await manager.set(TEST_USER_ID, createTestState(), 0);

      // Advance time significantly
      vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 24 hours

      const state = await manager.get(TEST_USER_ID);
      expect(state).not.toBeNull();
      expect(state!.helloMessage).toBe(1);
    });

    it('should be able to delete permanent entry explicitly', async () => {
      await manager.set(TEST_USER_ID, createTestState());
      
      await manager.delete(TEST_USER_ID);
      
      const state = await manager.get(TEST_USER_ID);
      expect(state).toBeNull();
    });
  });

  describe('cleanup() method', () => {
    it('should remove only expired entries', async () => {
      const userIdTTL = 2001;
      const userIdPermanent = 2002;

      await manager.set(userIdTTL, createTestState(1), 1); // expires at 1s
      await manager.set(userIdPermanent, createTestState(2)); // no TTL

      vi.advanceTimersByTime(2 * 1000); // Advance past TTL

      // Before cleanup: TTL entry still accessible via get (triggers lazy cleanup)
      expect(await manager.get(userIdTTL)).toBeNull(); // Already cleaned

      // But for testing cleanup() directly, we need to not have called get yet
      // So let's set up again
      const userIdTTL2 = 2003;
      await manager.set(userIdTTL2, createTestState(1), 1);
      await manager.set(userIdPermanent, createTestState(2));

      vi.advanceTimersByTime(2 * 1000);

      // Call cleanup
      const removedCount = manager.cleanup();

      expect(removedCount).toBe(1); // Only the TTL entry should be removed

      // Permanent entry should still exist
      const state = await manager.get(userIdPermanent);
      expect(state).not.toBeNull();
      expect(state!.helloMessage).toBe(2);
    });

    it('should return 0 when no expired entries exist', async () => {
      await manager.set(TEST_USER_ID, createTestState(), 10); // not expired

      const removedCount = manager.cleanup();
      expect(removedCount).toBe(0);
    });

    it('should not affect entries without TTL', async () => {
      const userId1 = 3001;
      const userId2 = 3002;

      await manager.set(userId1, createTestState(1)); // permanent
      await manager.set(userId2, createTestState(2)); // permanent

      vi.advanceTimersByTime(60 * 1000); // 1 minute

      const removedCount = manager.cleanup();
      expect(removedCount).toBe(0);

      // Both should still exist
      expect(await manager.get(userId1)).not.toBeNull();
      expect(await manager.get(userId2)).not.toBeNull();
    });
  });

  describe('set() overwrites existing entry', () => {
    it('should reset TTL when overwriting existing entry', async () => {
      await manager.set(TEST_USER_ID, createTestState(1), 1); // 1s TTL
      
      vi.advanceTimersByTime(500); // 0.5s passed

      // Overwrite with new TTL
      await manager.set(TEST_USER_ID, createTestState(2), 5); // 5s TTL

      // At 2s: original would be expired, but new TTL should still be valid
      vi.advanceTimersByTime(1500); // 1.5s more (2s total from start)
      let state = await manager.get(TEST_USER_ID);
      expect(state).not.toBeNull();
      expect(state!.helloMessage).toBe(2); // New state

      // At 6s: should be expired now
      vi.advanceTimersByTime(4 * 1000);
      state = await manager.get(TEST_USER_ID);
      expect(state).toBeNull();
    });

    it('should make entry permanent when overwriting with no TTL', async () => {
      await manager.set(TEST_USER_ID, createTestState(1), 1); // TTL
      
      vi.advanceTimersByTime(500);

      // Overwrite with no TTL (permanent)
      await manager.set(TEST_USER_ID, createTestState(2));

      vi.advanceTimersByTime(24 * 60 * 60 * 1000); // 24 hours

      const state = await manager.get(TEST_USER_ID);
      expect(state).not.toBeNull();
      expect(state!.helloMessage).toBe(2);
    });
  });

  describe('clear() method', () => {
    it('should remove all entries including permanent ones', async () => {
      const userId1 = 4001;
      const userId2 = 4002;

      await manager.set(userId1, createTestState(1), 1);
      await manager.set(userId2, createTestState(2)); // permanent

      manager.clear();

      expect(await manager.get(userId1)).toBeNull();
      expect(await manager.get(userId2)).toBeNull();
    });
  });

  describe('delete() method', () => {
    it('should immediately remove entry regardless of TTL', async () => {
      await manager.set(TEST_USER_ID, createTestState(), 60);

      await manager.delete(TEST_USER_ID);

      const state = await manager.get(TEST_USER_ID);
      expect(state).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle get() for non-existent user', async () => {
      const state = await manager.get(99999);
      expect(state).toBeNull();
    });

    it('should handle cleanup() on empty map', () => {
      const removedCount = manager.cleanup();
      expect(removedCount).toBe(0);
    });

    it('should handle very short TTL (1ms)', async () => {
      await manager.set(TEST_USER_ID, createTestState(), 0.001); // 1ms
      
      vi.advanceTimersByTime(10); // 10ms

      const state = await manager.get(TEST_USER_ID);
      expect(state).toBeNull();
    });

    it('should handle fractional TTL in seconds', async () => {
      await manager.set(TEST_USER_ID, createTestState(), 0.5); // 500ms
      
      vi.advanceTimersByTime(300); // 300ms - should still exist
      let state = await manager.get(TEST_USER_ID);
      expect(state).not.toBeNull();

      vi.advanceTimersByTime(300); // 600ms total - should be expired
      state = await manager.get(TEST_USER_ID);
      expect(state).toBeNull();
    });
  });
});
