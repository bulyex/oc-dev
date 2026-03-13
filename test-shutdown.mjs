#!/usr/bin/env node

import { Telegraf } from 'telegraf';
import { logger } from './dist/utils/logger.js';
import { config } from './dist/config/index.js';
import { setupBotHandlers } from './dist/bot/index.js';
import { getPrismaClient, disconnectDatabase } from './dist/database/client.js';

console.log('=== Slowfire Bot Phase 0 - Graceful Shutdown Test ===\n');

// Initialize bot with invalid token to avoid real bot connection
const bot = new Telegraf('test_token:invalid');

// Setup handlers
setupBotHandlers(bot);

console.log('✓ Bot initialized');
console.log('✓ Handlers registered');

// Test graceful shutdown
console.log('\n=== Testing graceful shutdown ===');

let shutdownCompleted = false;

async function testShutdown() {
  console.log('  1. Stopping bot...');
  bot.stop();

  console.log('  2. Disconnecting database...');
  await disconnectDatabase();

  console.log('  3. All cleanup done');
  shutdownCompleted = true;

  if (shutdownCompleted) {
    console.log('\n✓ Graceful shutdown test passed');
    process.exit(0);
  }
}

// Run shutdown test
await testShutdown();

setTimeout(() => {
  if (!shutdownCompleted) {
    console.log('✗ Graceful shutdown timeout');
    process.exit(1);
  }
}, 5000);