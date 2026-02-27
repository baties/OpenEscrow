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

/** @type {import('next').NextConfig} */
const nextConfig = {
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
    return webpackConfig;
  },

  // ─── Transpile packages ───────────────────────────────────────────────────────
  // Shared workspace package must be transpiled by Next.js since it's not compiled.
  transpilePackages: ['@open-escrow/shared'],
};

export default nextConfig;
