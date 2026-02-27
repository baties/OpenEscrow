/**
 * vitest.config.ts — OpenEscrow Telegram Bot
 *
 * Handles: Vitest test runner configuration for the bot test suite.
 * Does NOT: configure TypeScript compilation (see tsconfig.json),
 *           lint rules (see root eslint.config.mjs).
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * Use 'node' environment — the bot is a Node.js process,
     * not a browser or jsdom context.
     */
    environment: 'node',

    /**
     * Test file glob patterns — all .test.ts files in tests/.
     */
    include: ['tests/**/*.test.ts'],

    /**
     * Run each test file in isolation to prevent module state cross-contamination.
     * Required because sessions store uses a module-level Map.
     */
    isolate: true,

    /**
     * Pool mode: forks — safer for module isolation with vi.mock().
     */
    pool: 'forks',

    /**
     * Globals: false — use explicit vi imports (strict mode).
     */
    globals: false,

    /**
     * Coverage configuration (used when running test:coverage).
     */
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'], // Entry point — not unit-testable in isolation
    },
  },
});
