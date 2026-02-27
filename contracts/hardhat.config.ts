/**
 * hardhat.config.ts — OpenEscrow contracts
 *
 * Hardhat configuration for the OpenEscrow smart contract suite.
 * Handles: compiler settings, Sepolia network configuration, plugin loading.
 * Does NOT: contain contract logic, deploy scripts, or test helpers.
 *
 * Environment variables (all sourced from .env at repo root or shell):
 *   SEPOLIA_RPC_URL         — Alchemy/Infura/etc. RPC endpoint for Sepolia
 *   DEPLOYER_PRIVATE_KEY    — Private key of the deployer wallet (no 0x prefix needed)
 *   ETHERSCAN_API_KEY       — Etherscan API key for contract verification (optional)
 */

import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';

// Load env vars from the repo-root .env if available.
// dotenv is bundled with @nomicfoundation/hardhat-toolbox via hardhat-network-helpers.
// We do a best-effort load; if the file is absent (e.g., CI with injected env), it's fine.
import * as path from 'path';
import * as fs from 'fs';

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config({ path: envPath });
}

const SEPOLIA_RPC_URL: string = process.env['SEPOLIA_RPC_URL'] ?? '';
const DEPLOYER_PRIVATE_KEY: string = process.env['DEPLOYER_PRIVATE_KEY'] ?? '';
const ETHERSCAN_API_KEY: string = process.env['ETHERSCAN_API_KEY'] ?? '';

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
    hardhat: {
      // Local in-process network used for unit tests.
      chainId: 31337,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: DEPLOYER_PRIVATE_KEY ? [`0x${DEPLOYER_PRIVATE_KEY.replace(/^0x/, '')}`] : [],
    },
  },
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
};

export default config;
