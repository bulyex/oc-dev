#!/usr/bin/env node

import dotenv from 'dotenv';

// Load environment before importing config
dotenv.config({ path: '.env.degraded' });

// Delete the config from require cache to force reload
const configModule = await import('./dist/config/index.js');
const { config, hasDatabase } = configModule;

const { logger } = await import('./dist/utils/logger.js');
const { getPrismaClient } = await import('./dist/database/client.js');

console.log('=== Slowfire Bot Phase 0 - Degraded Mode Test ===\n');

console.log('✓ Config loaded');
console.log('  - TELEGRAM_BOT_TOKEN:', config.telegramBotToken ? '***hidden***' : 'MISSING');
console.log('  - NODE_ENV:', config.nodeEnv);
console.log('  - DATABASE_URL:', config.databaseUrl ? 'set' : 'not set (DEGRADED MODE)');
console.log('  - hasDatabase:', hasDatabase);

// Test degraded mode
console.log('\n=== Testing degraded mode (no database) ===');
const prisma = getPrismaClient();
if (prisma) {
  console.log('✗ Unexpected: Database connected when it should be degraded');
  await prisma.$disconnect();
  process.exit(1);
} else {
  console.log('✓ Degraded mode working (no database)');
}

console.log('\n=== Degraded mode test passed ===');
process.exit(0);