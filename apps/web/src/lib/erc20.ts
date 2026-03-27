/**
 * erc20.ts — OpenEscrow Web Dashboard
 *
 * Shared ERC-20 contract constants used across the web app for on-chain
 * token reads (balance checks, tx counts).
 * Handles: minimal ERC-20 ABI fragment and token decimal constant.
 * Does NOT: contain business logic, API calls, or wallet interaction.
 *
 * USDC and USDT both use 6 decimal places on all chains supported by OpenEscrow
 * (Sepolia, Ethereum Mainnet, BNB Smart Chain, Polygon Mainnet).
 */

/**
 * Minimal ERC-20 ABI containing only the functions needed by OpenEscrow's web app.
 * `as const` allows viem/wagmi to infer precise return types (e.g. bigint for uint256).
 *
 * Dependency: none — standard ERC-20 interface, no library needed.
 * Why minimal: importing a full ERC-20 ABI adds unnecessary bundle weight and
 * surface area. We only ever call balanceOf.
 */
export const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Decimal places for USDC and USDT on all chains OpenEscrow supports.
 * Both tokens use 6 decimals regardless of chain.
 *
 * Note: this differs from ETH (18 decimals) and WBTC (8 decimals).
 * Do not reuse this constant for other ERC-20 tokens without verifying.
 */
export const STABLECOIN_DECIMALS = 6;
