/**
 * hardhat.config.ts — OpenEscrow contracts
 *
 * Hardhat configuration for the OpenEscrow smart contract suite.
 * Handles: compiler settings, multi-chain network configuration, plugin loading,
 *          and multi-chain Etherscan/scanner verification config.
 * Does NOT: contain contract logic, deploy scripts, or test helpers.
 *
 * Supported networks (one-chain-per-deployment model — see DECISIONS.md DEC-006):
 *   hardhat   — in-process network for unit tests
 *   sepolia   — Ethereum Sepolia testnet (current default)
 *   mainnet   — Ethereum mainnet (after audit — Phase 7)
 *   bsc       — BNB Smart Chain mainnet (after audit — Phase 7)
 *   polygon   — Polygon mainnet (after audit — Phase 7)
 *
 * Environment variables (all sourced from .env at repo root or shell):
 *   DEPLOYER_PRIVATE_KEY  — Private key of the deployer wallet
 *   SEPOLIA_RPC_URL       — RPC endpoint for Ethereum Sepolia
 *   MAINNET_RPC_URL       — RPC endpoint for Ethereum mainnet
 *   BSC_RPC_URL           — RPC endpoint for BNB Smart Chain
 *   POLYGON_RPC_URL       — RPC endpoint for Polygon
 *   ETHERSCAN_API_KEY     — Etherscan API key (Ethereum mainnet + Sepolia)
 *   BSCSCAN_API_KEY       — BscScan API key (BNB Smart Chain)
 *   POLYGONSCAN_API_KEY   — PolygonScan API key (Polygon)
 */

import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@openzeppelin/hardhat-upgrades';

import * as path from 'path';
import * as fs from 'fs';

// Best-effort load of root .env; fine if absent (CI uses injected env vars).
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: envPath });
}

const DEPLOYER_PRIVATE_KEY: string = process.env['DEPLOYER_PRIVATE_KEY'] ?? '';
/** Normalizes a private key: strips leading 0x if present, prefixes with 0x. */
const pk = (key: string): string[] => (key ? [`0x${key.replace(/^0x/, '')}`] : []);

// ─── RPC endpoints ────────────────────────────────────────────────────────────
// RPC_URL is the generic active-chain endpoint set in root .env (one-chain-per-deployment).
// Chain-specific overrides (SEPOLIA_RPC_URL etc.) take precedence when set.
const RPC_URL: string = process.env['RPC_URL'] ?? '';
const SEPOLIA_RPC_URL: string = process.env['SEPOLIA_RPC_URL'] ?? RPC_URL;
const MAINNET_RPC_URL: string = process.env['MAINNET_RPC_URL'] ?? '';
const BSC_RPC_URL: string = process.env['BSC_RPC_URL'] ?? '';
const POLYGON_RPC_URL: string = process.env['POLYGON_RPC_URL'] ?? '';

// ─── Block explorer API keys ──────────────────────────────────────────────────
const ETHERSCAN_API_KEY: string = process.env['ETHERSCAN_API_KEY'] ?? '';
const BSCSCAN_API_KEY: string = process.env['BSCSCAN_API_KEY'] ?? '';
const POLYGONSCAN_API_KEY: string = process.env['POLYGONSCAN_API_KEY'] ?? '';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    // ── Local in-process network (unit tests) ──────────────────────────────
    hardhat: {
      chainId: 31337,
    },

    // ── Ethereum Sepolia testnet ───────────────────────────────────────────
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: pk(DEPLOYER_PRIVATE_KEY),
    },

    // ── Ethereum mainnet (Phase 7 — after audit) ───────────────────────────
    mainnet: {
      url: MAINNET_RPC_URL,
      chainId: 1,
      accounts: pk(DEPLOYER_PRIVATE_KEY),
    },

    // ── BNB Smart Chain mainnet (Phase 7 — after audit) ───────────────────
    bsc: {
      url: BSC_RPC_URL || 'https://bsc-dataseed.binance.org/',
      chainId: 56,
      accounts: pk(DEPLOYER_PRIVATE_KEY),
    },

    // ── Polygon mainnet (Phase 7 — after audit) ───────────────────────────
    polygon: {
      url: POLYGON_RPC_URL || 'https://polygon-rpc.com/',
      chainId: 137,
      accounts: pk(DEPLOYER_PRIVATE_KEY),
    },
  },

  // Etherscan V2: single API key covers all chains (mainnet, Sepolia, BSC, Polygon).
  // V1 per-network object is deprecated — see https://docs.etherscan.io/v2-migration
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },

  paths: {
    sources: './src',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },

  typechain: {
    outDir: './typechain-types',
    target: 'ethers-v6',
  },

  sourcify: {
    enabled: true,
  },
};

export default config;
