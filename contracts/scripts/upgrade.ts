/**
 * upgrade.ts — OpenEscrow contracts/scripts
 *
 * Upgrade script for the OpenEscrow UUPS proxy to a new implementation.
 * Handles: validating upgrade safety, deploying new implementation, and
 *          calling upgradeProxy() to point the proxy at the new implementation.
 * Does NOT: deploy a new proxy (see deploy.ts), change token addresses,
 *           or reset deal state.
 *
 * Usage (from contracts/):
 *   pnpm upgrade:sepolia   — upgrade proxy on Sepolia
 *   pnpm upgrade:mainnet  — upgrade proxy on Ethereum mainnet
 *   pnpm upgrade:bsc      — upgrade proxy on BNB Smart Chain
 *   pnpm upgrade:polygon  — upgrade proxy on Polygon
 *
 * Required env vars (sourced from root .env):
 *   CONTRACT_ADDRESS      — Current proxy address (set after initial deploy)
 *   DEPLOYER_PRIVATE_KEY  — Must be the same wallet that owns the proxy
 *   <NETWORK>_RPC_URL     — RPC endpoint for the target network
 *
 * IMPORTANT: Before upgrading to a new version (V2, V3, ...):
 *   1. Update the contract name on line marked UPGRADE_TARGET below.
 *   2. Ensure new storage vars are appended (never reorder/delete existing).
 *   3. Run `npx hardhat check` (storage layout validation) before upgrading mainnet.
 */

import { ethers, upgrades } from 'hardhat';

/** Name of the new implementation contract to upgrade to. Change this for each new version. */
const UPGRADE_TARGET = 'OpenEscrowV1'; // Change to 'OpenEscrowV2' when upgrading to V2, etc.

/**
 * Main upgrade entry point. Reads proxy address from env, validates upgrade compatibility,
 * and performs the upgrade.
 *
 * @returns Promise that resolves when upgrade is complete.
 * @throws {Error} If proxy address is missing, upgrade is unsafe, or tx fails.
 */
async function main(): Promise<void> {
  const proxyAddress = process.env['CONTRACT_ADDRESS'];
  if (!proxyAddress) {
    throw new Error('Missing env var: CONTRACT_ADDRESS — set this to the current proxy address');
  }

  const network = await ethers.provider.getNetwork();
  console.log('[upgrade] Starting proxy upgrade...');
  console.log(`[upgrade] Network: ${network.name} (chainId: ${network.chainId})`);
  console.log(`[upgrade] Proxy address: ${proxyAddress}`);
  console.log(`[upgrade] New implementation: ${UPGRADE_TARGET}`);

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error('No deployer signer found — check DEPLOYER_PRIVATE_KEY env var');
  console.log(`[upgrade] Deployer (must be proxy owner): ${deployer.address}`);

  const NewFactory = await ethers.getContractFactory(UPGRADE_TARGET);

  // validateUpgrade checks storage layout compatibility before touching mainnet.
  // This will throw if there are incompatible storage changes.
  console.log('[upgrade] Validating storage layout compatibility...');
  await upgrades.validateUpgrade(proxyAddress, NewFactory, { kind: 'uups' });
  console.log('[upgrade] Storage layout OK.');

  // Perform the upgrade.
  const upgraded = await upgrades.upgradeProxy(proxyAddress, NewFactory, { kind: 'uups' });
  await upgraded.waitForDeployment();

  const newImplAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log(`[upgrade] Upgrade complete.`);
  console.log(`[upgrade] Proxy address unchanged: ${proxyAddress}`);
  console.log(`[upgrade] New implementation at:   ${newImplAddress}`);
  console.log(`[upgrade] Verify on block explorer:`);
  console.log(`  npx hardhat verify --network <network> ${newImplAddress} --no-compile`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[upgrade] Upgrade failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
