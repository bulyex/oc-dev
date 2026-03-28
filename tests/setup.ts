// Vitest setup file - set required env vars before modules are imported
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// Ensure data directory exists
const dataDir = join(process.cwd(), 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

// Set env vars - these must be set BEFORE any modules are imported
process.env.TELEGRAM_BOT_TOKEN = 'test_token_12345';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${join(dataDir, 'test.db')}`;

// For vitest, we need to pass these to the test process via flag
// This ensures config/index.ts sees them when it first loads
console.log('Setup: DATABASE_URL =', process.env.DATABASE_URL);
