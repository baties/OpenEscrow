/**
 * use-wallet-info.ts — OpenEscrow Web Dashboard
 *
 * Custom hook for fetching on-chain information about an EVM wallet address.
 * Handles: address validation, transaction count lookup, USDC and USDT balance lookup.
 * Does NOT: manage auth state, make API calls to the OpenEscrow backend,
 *            or interact with the smart contract.
 *
 * Used by the New Deal form to give clients visibility into the freelancer's
 * wallet before creating a deal. Shows tx count (activity signal) and token
 * balances so the client can verify they have the right address.
 *
 * Dependency: wagmi's usePublicClient — viem public client for read-only RPC calls.
 * Why: already a project dependency; avoids a separate RPC call setup.
 * Security: read-only; no private keys or signing involved.
 */

import { useState, useEffect, useRef } from 'react';
import { usePublicClient } from 'wagmi';
import { isAddress, formatUnits } from 'viem';
import { config as appConfig } from '@/lib/config';
import { ERC20_ABI, STABLECOIN_DECIMALS } from '@/lib/erc20';

/**
 * Information fetched about a wallet address from the chain.
 */
export interface WalletInfo {
  /**
   * Number of transactions SENT from this address (the EVM nonce).
   * This is the outgoing transaction count, NOT the total transaction count
   * (which would include incoming transfers). Use the label "Sent Txns" in the UI.
   */
  sentTxCount: number;
  /** USDC balance formatted to 2 decimal places, e.g. "1,234.56" */
  usdcBalance: string;
  /** USDT balance formatted to 2 decimal places, e.g. "500.00" */
  usdtBalance: string;
}

/**
 * State returned by the useWalletInfo hook.
 */
export interface UseWalletInfoResult {
  /** Wallet info fetched from chain, or null if not yet loaded or address invalid */
  info: WalletInfo | null;
  /** True while fetching is in progress */
  isLoading: boolean;
  /** Error message if the fetch failed, null otherwise */
  error: string | null;
}

/**
 * Debounce delay before triggering an RPC lookup after the address changes.
 * 600ms balances responsiveness with avoiding excessive RPC calls on keystrokes.
 */
const DEBOUNCE_MS = 600;

/**
 * Fetches on-chain information for an EVM wallet address: transaction count
 * and USDC/USDT balances on the active chain.
 *
 * Only fetches when `address` is a valid EVM address. The fetch is debounced
 * by 600ms to avoid RPC calls on every keystroke.
 *
 * @param address - The wallet address to look up (may be incomplete during typing)
 * @returns Loading state, wallet info, and any error
 */
export function useWalletInfo(address: string): UseWalletInfoResult {
  const publicClient = usePublicClient();
  const [info, setInfo] = useState<WalletInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref to cancel in-flight fetch if address changes before completion
  const cancelledRef = useRef(false);

  useEffect(() => {
    // Reset state when address changes
    setInfo(null);
    setError(null);

    if (!address || !isAddress(address)) {
      setIsLoading(false);
      return;
    }

    // Valid address — debounce the fetch
    cancelledRef.current = false;
    setIsLoading(true);

    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (!publicClient) {
            throw new Error('No RPC connection available. Check your wallet connection.');
          }

          // After the isAddress() guard above, address is narrowed to `0x${string}`.
          // We re-confirm via the type from viem so the parallel calls are typed correctly.
          const evmAddress = address; // narrowed to `0x${string}` by the isAddress() guard

          // Parallel fetch: tx count + USDC balance + USDT balance
          const [sentTxCount, usdcRaw, usdtRaw] = await Promise.all([
            publicClient.getTransactionCount({ address: evmAddress }),
            publicClient.readContract({
              address: appConfig.usdcAddress,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [evmAddress],
            }),
            publicClient.readContract({
              address: appConfig.usdtAddress,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [evmAddress],
            }),
          ]);

          if (cancelledRef.current) return;

          /**
           * formatUnits converts from raw token units (bigint) to a human-readable
           * decimal string. Both USDC and USDT use 6 decimals on all supported chains.
           * viem's readContract infers bigint for uint256 outputs from the typed ABI.
           */
          const usdcBalance = Number(formatUnits(usdcRaw, STABLECOIN_DECIMALS)).toLocaleString(
            'en-US',
            { minimumFractionDigits: 2, maximumFractionDigits: 2 }
          );
          const usdtBalance = Number(formatUnits(usdtRaw, STABLECOIN_DECIMALS)).toLocaleString(
            'en-US',
            { minimumFractionDigits: 2, maximumFractionDigits: 2 }
          );

          setInfo({ sentTxCount, usdcBalance, usdtBalance });
          setError(null);
        } catch (err) {
          if (cancelledRef.current) return;
          const message = err instanceof Error ? err.message : String(err);
          setError(`Could not fetch wallet info: ${message}`);
          setInfo(null);
        } finally {
          if (!cancelledRef.current) {
            setIsLoading(false);
          }
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      cancelledRef.current = true;
    };
  }, [address, publicClient]);

  return { info, isLoading, error };
}
