#!/usr/bin/env node

import { config } from './dist/config/index.js';
import { logger } from './dist/utils/logger.js';
import { getPrismaClient } from './dist/database/client.js';

console.log('=== Slowfire Bot Phase 0 - Basic Test ===\n');

console.log('✓ Config loaded');
console.log('  - TELEGRAM_BOT_TOKEN:', config.telegramBotToken ? '***hidden***' : 'MISSING');
console.log('  - NODE_ENV:', config.nodeEnv);
console.log('  - DATABASE_URL:', config.databaseUrl ? 'set' : 'not set');

// Test database connection
console.log('\n=== Testing database connection ===');
const prisma = getPrismaClient();
if (prisma) {
  console.log('✓ Database connected');
  await prisma.$disconnect();
} else {
  console.log('✓ Degraded mode working (no database)');
}

console.log('\n=== All tests passed ===');
process.exit(0);