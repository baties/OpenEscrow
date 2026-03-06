/**
 * config.ts — OpenEscrow Web Dashboard
 *
 * Runtime configuration loaded from environment variables.
 * Handles: parsing and validating NEXT_PUBLIC_* env vars at module load time.
 * Does NOT: contain secrets (all vars are NEXT_PUBLIC_ = client-side safe),
 *            perform API calls, or manage auth state.
 *
 * All env vars are expected to be set at build time by Next.js.
 * Missing required vars will throw at module import time to surface issues early.
 */

/**
 * Application configuration derived from environment variables.
 * All fields are read-only after initialization.
 */
export interface AppConfig {
  /** Base URL of the OpenEscrow API, e.g. http://localhost:3001 */
  readonly apiUrl: string;
  /** EVM chain ID — 11155111 for Sepolia testnet */
  readonly chainId: number;
  /** Deployed OpenEscrow contract address (checksum address) */
  readonly contractAddress: `0x${string}`;
  /** USDC token contract address on the target chain */
  readonly usdcAddress: `0x${string}`;
  /** USDT token contract address on the target chain */
  readonly usdtAddress: `0x${string}`;
  /** WalletConnect Cloud project ID */
  readonly walletConnectProjectId: string;
}

/**
 * Validates a required string value from a NEXT_PUBLIC_* env var.
 * The value must be passed directly as a static `process.env.NEXT_PUBLIC_*`
 * reference at the call site so Next.js can inline it into the client bundle.
 * Dynamic key lookups (process.env[key]) are NOT inlined by Next.js webpack.
 *
 * @param key - Variable name used only for the error message
 * @param value - The already-read env value (pass process.env.NEXT_PUBLIC_FOO directly)
 * @returns The trimmed string value
 * @throws {Error} If the value is not set or is an empty string
 */
function requireEnv(key: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(`[config] Required environment variable ${key} is not set`);
  }
  return value.trim();
}

/**
 * Validates an EVM address value from a NEXT_PUBLIC_* env var.
 *
 * @param key - Variable name used only for the error message
 * @param value - The already-read env value (pass process.env.NEXT_PUBLIC_FOO directly)
 * @returns The address cast to the 0x-prefixed string type
 * @throws {Error} If the value is not set or does not start with "0x"
 */
function requireAddressEnv(key: string, value: string | undefined): `0x${string}` {
  const str = requireEnv(key, value);
  if (!str.startsWith('0x')) {
    throw new Error(`[config] ${key} must be a hex address starting with 0x, got: ${str}`);
  }
  return str as `0x${string}`;
}

/**
 * Validates a numeric value from a NEXT_PUBLIC_* env var.
 *
 * @param key - Variable name used only for the error message
 * @param value - The already-read env value (pass process.env.NEXT_PUBLIC_FOO directly)
 * @param defaultValue - Fallback if the value is not set
 * @returns The parsed integer value
 * @throws {Error} If the value cannot be parsed as a finite integer
 */
function requireNumberEnv(key: string, value: string | undefined, defaultValue?: number): number {
  if (!value || value.trim() === '') {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`[config] Required numeric environment variable ${key} is not set`);
  }
  const parsed = parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`[config] Environment variable ${key} is not a valid integer: ${value}`);
  }
  return parsed;
}

/**
 * Singleton application config, initialized at module load time.
 * Each process.env.NEXT_PUBLIC_* reference is static so Next.js can inline
 * the values into the client bundle at compile time.
 * Throws immediately if any required env var is missing.
 */
export const config: AppConfig = {
  apiUrl:                requireEnv('NEXT_PUBLIC_API_URL',                    process.env.NEXT_PUBLIC_API_URL),
  chainId:               requireNumberEnv('NEXT_PUBLIC_CHAIN_ID',             process.env.NEXT_PUBLIC_CHAIN_ID, 11155111),
  contractAddress:       requireAddressEnv('NEXT_PUBLIC_CONTRACT_ADDRESS',    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS),
  usdcAddress:           requireAddressEnv('NEXT_PUBLIC_USDC_ADDRESS',        process.env.NEXT_PUBLIC_USDC_ADDRESS),
  usdtAddress:           requireAddressEnv('NEXT_PUBLIC_USDT_ADDRESS',        process.env.NEXT_PUBLIC_USDT_ADDRESS),
  walletConnectProjectId: requireEnv('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID',  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID),
} as const;
