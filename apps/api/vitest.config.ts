/**
 * vitest.config.ts — OpenEscrow API
 *
 * Handles: Vitest configuration for unit and integration tests.
 *          Sets up path aliases, coverage config, and test environment.
 * Does NOT: run tests itself; this is a configuration file only.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/database/migrate.ts'],
    },
    // Clear mocks between tests.
    clearMocks: true,
    restoreMocks: true,
  },
  resolve: {
    // Support .js extension imports (required for ESM).
    extensions: ['.ts', '.js'],
  },
});
