import { configDefaults, defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/services/database.test.setup.ts'],
    env: {
      NODE_ENV: 'test',
      VITEST: 'true',
    },
    exclude: [
      ...configDefaults.exclude,
      '**/dist/**',
      '**/.worktrees/**',
      '**/tests/e2e/**',
    ],
    // Run test files sequentially to avoid database conflicts
    // All tests share the same test.db file, so parallel execution causes race conditions
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
