/**
 * TokenBalances.tsx — OpenEscrow Web Dashboard
 *
 * Compact inline display of the connected user's USDC and USDT balances.
 * Handles: reading USDC and USDT balances via useReadContract (ERC-20 balanceOf),
 *          formatting and displaying them in the Navbar.
 * Does NOT: manage auth state, make API calls, or handle wallet connection.
 *
 * Shown only when the wallet is connected and the user is authenticated.
 * Balances are refreshed automatically by wagmi's internal cache (every 30s default).
 *
 * Dependency: wagmi useReadContract — reads ERC-20 balanceOf from the chain.
 * Why: already a project dependency; no extra library needed for a simple read.
 * Bundle cost: zero additional cost (wagmi is already bundled).
 */

'use client';

import { useAccount } from 'wagmi';
import { useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { config as appConfig } from '@/lib/config';
import { ERC20_ABI, STABLECOIN_DECIMALS } from '@/lib/erc20';

/**
 * Formats a raw ERC-20 balance bigint to a compact human-readable string.
 * E.g. 1_234_560_000n → "1,234.56", 500_000n → "0.50"
 *
 * @param raw - Raw token amount as bigint (6 decimal places)
 * @returns Formatted string with up to 2 decimal places
 */
function formatBalance(raw: bigint): string {
  return Number(formatUnits(raw, STABLECOIN_DECIMALS)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Renders a compact USDC and USDT balance row for the currently connected wallet.
 * Shows a loading state while balances are being fetched, and hides on error.
 * Intended for use inside the Navbar alongside the RainbowKit ConnectButton.
 *
 * @returns Token balance badges JSX, or null if wallet not connected
 */
export function TokenBalances() {
  const { address, isConnected } = useAccount();

  const { data: usdcRaw, isLoading: usdcLoading } = useReadContract({
    address: appConfig.usdcAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address,
      staleTime: 30_000, // 30 seconds — matches the deal polling interval
      retry: 2,
    },
  });

  const { data: usdtRaw, isLoading: usdtLoading } = useReadContract({
    address: appConfig.usdtAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address,
      staleTime: 30_000,
      retry: 2,
    },
  });

  if (!isConnected || !address) return null;

  const isLoading = usdcLoading || usdtLoading;

  if (isLoading) {
    return (
      <div className="hidden items-center gap-1.5 sm:flex" aria-label="Loading token balances">
        <span className="h-4 w-16 animate-pulse rounded bg-gray-200" />
        <span className="h-4 w-16 animate-pulse rounded bg-gray-200" />
      </div>
    );
  }

  // Hide entirely if both reads failed (don't show zeros that might confuse)
  if (usdcRaw === undefined && usdtRaw === undefined) return null;

  return (
    <div className="hidden items-center gap-2 sm:flex" aria-label="Token balances">
      {usdcRaw !== undefined && (
        <span
          className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-100"
          title={`Your USDC balance on ${appConfig.chainMeta.name}`}
        >
          {formatBalance(usdcRaw)} USDC
        </span>
      )}
      {usdtRaw !== undefined && (
        <span
          className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-100"
          title={`Your USDT balance on ${appConfig.chainMeta.name}`}
        >
          {formatBalance(usdtRaw)} USDT
        </span>
      )}
    </div>
  );
}
