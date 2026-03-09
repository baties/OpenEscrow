/**
 * next.config.mjs — OpenEscrow Web Dashboard
 *
 * Next.js configuration for the web dashboard.
 * Handles: webpack polyfills for viem/wagmi Node.js built-ins (required for browser),
 *          security headers, and environment variable passthrough.
 * Does NOT: configure any custom server routes (handled by Next.js App Router),
 *            set up API proxying (the API runs on a separate port/container).
 *
 * Webpack polyfill rationale:
 * wagmi/viem depend on Node.js built-ins (crypto, stream, etc.) that are not
 * available in the browser bundle. Next.js requires explicit fallbacks. This is
 * a standard requirement for any Ethereum web app using these libraries.
 *
 * Note: .mjs extension required for Next.js 14 compatibility (.ts not supported).
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker: generates .next/standalone/ with a self-contained server.js
  // that doesn't need the full node_modules tree at runtime.
  output: 'standalone',
  // Required for pnpm monorepo: tells Next.js to trace node_modules from the workspace
  // root (two levels up from apps/web/) so that packages like `next` itself — which live
  // in the root node_modules — are included in the standalone output bundle.
  // Without this, `node apps/web/.next/standalone/server.js` fails with:
  //   "Cannot find module 'next'"
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
  // ─── Security Headers ────────────────────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },

  // ─── Webpack polyfills for browser-incompatible Node.js built-ins ───────────
  // Required by wagmi/viem and their ethers.js/secp256k1 dependencies.
  // @react-native-async-storage/async-storage: MetaMask SDK imports this React
  // Native module in its browser bundle. Aliasing to false tells webpack to
  // skip it — it is never used in the actual browser code path.
  webpack(webpackConfig) {
    webpackConfig.resolve = webpackConfig.resolve ?? {};
    webpackConfig.resolve.fallback = {
      ...webpackConfig.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
      stream: false,
      path: false,
      os: false,
      http: false,
      https: false,
      zlib: false,
    };
    webpackConfig.resolve.alias = {
      ...webpackConfig.resolve.alias,
      '@react-native-async-storage/async-storage': false,
    };
    return webpackConfig;
  },

  // ─── Transpile packages ───────────────────────────────────────────────────────
  // Shared workspace package must be transpiled by Next.js since it's not compiled.
  transpilePackages: ['@open-escrow/shared'],
};

export default nextConfig;
