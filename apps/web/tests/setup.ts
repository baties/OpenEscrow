/**
 * setup.ts — OpenEscrow Web Dashboard Tests
 *
 * Global test setup file run before all test files.
 * Handles: environment variable stubs required by the config module,
 *          global mocks for browser APIs not available in jsdom.
 * Does NOT: test anything — this is setup-only.
 */

// Provide required NEXT_PUBLIC_* env vars so config.ts does not throw on import
process.env['NEXT_PUBLIC_API_URL'] = 'http://localhost:3001';
process.env['NEXT_PUBLIC_CHAIN_ID'] = '11155111';
process.env['NEXT_PUBLIC_CONTRACT_ADDRESS'] = '0x1234567890123456789012345678901234567890';
process.env['NEXT_PUBLIC_USDC_ADDRESS'] = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
process.env['NEXT_PUBLIC_USDT_ADDRESS'] = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
process.env['NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID'] = 'test-project-id';

// Stub window.matchMedia (not implemented in jsdom, but referenced by RainbowKit)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});
