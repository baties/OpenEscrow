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
 * Reads and validates a required NEXT_PUBLIC_* environment variable.
 *
 * @param key - The environment variable name to read
 * @returns The string value of the variable
 * @throws {Error} If the variable is not set or is an empty string
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`[config] Required environment variable ${key} is not set`);
  }
  return value.trim();
}

/**
 * Reads and validates an EVM address environment variable.
 *
 * @param key - The environment variable name to read
 * @returns The address cast to the 0x-prefixed string type
 * @throws {Error} If the variable is not set or does not start with "0x"
 */
function requireAddressEnv(key: string): `0x${string}` {
  const value = requireEnv(key);
  if (!value.startsWith('0x')) {
    throw new Error(`[config] ${key} must be a hex address starting with 0x, got: ${value}`);
  }
  return value as `0x${string}`;
}

/**
 * Reads and validates a numeric environment variable.
 *
 * @param key - The environment variable name to read
 * @param defaultValue - Optional fallback if the variable is not set
 * @returns The parsed integer value
 * @throws {Error} If the value cannot be parsed as a finite integer
 */
function requireNumberEnv(key: string, defaultValue?: number): number {
  const raw = process.env[key];
  if (!raw || raw.trim() === '') {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`[config] Required numeric environment variable ${key} is not set`);
  }
  const parsed = parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`[config] Environment variable ${key} is not a valid integer: ${raw}`);
  }
  return parsed;
}

/**
 * Singleton application config, initialized at module load time.
 * Throws immediately if any required env var is missing, preventing silent
 * misconfiguration from reaching users.
 */
export const config: AppConfig = {
  apiUrl: requireEnv('NEXT_PUBLIC_API_URL'),
  chainId: requireNumberEnv('NEXT_PUBLIC_CHAIN_ID', 11155111),
  contractAddress: requireAddressEnv('NEXT_PUBLIC_CONTRACT_ADDRESS'),
  usdcAddress: requireAddressEnv('NEXT_PUBLIC_USDC_ADDRESS'),
  usdtAddress: requireAddressEnv('NEXT_PUBLIC_USDT_ADDRESS'),
  walletConnectProjectId: requireEnv('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID'),
} as const;
