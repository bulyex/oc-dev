import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'tests/e2e/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
});
