/**
 * vitest.config.ts — OpenEscrow Web Dashboard
 *
 * Vitest configuration for unit tests.
 * Handles: test environment setup (jsdom for DOM APIs), path aliases,
 *          coverage configuration.
 * Does NOT: configure Next.js build, Tailwind, or run integration tests.
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // jsdom provides browser-like globals (localStorage, window, fetch, etc.)
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/app/**', // Pages are covered by e2e tests (Playwright, post-MVP)
        'src/providers/**', // Provider wiring tested via integration
        '**/*.d.ts',
      ],
    },
    setupFiles: ['./tests/setup.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // Allow tests to import from '@open-escrow/shared' without building the package
      '@open-escrow/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
