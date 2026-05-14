/**
 * hooks/use-agree-deal-onchain.ts — OpenEscrow Web Dashboard
 *
 * Handles: Sending the freelancer's on-chain agreeToDeal(chainDealId) transaction via MetaMask.
 *          Exposes step-by-step state so the deal detail page can render progress UI.
 * Does NOT: call the API, manage auth state, redirect the user,
 *            or handle the client's createDeal/deposit flow (see use-fund-deal-onchain.ts).
 *
 * The freelancer must call agreeToDeal on-chain AFTER the client calls createDeal on-chain
 * and BEFORE the client calls deposit. The smart contract enforces this ordering.
 */

'use client';

import { useState, useCallback } from 'react';
import { useWriteContract, usePublicClient } from 'wagmi';
import { config } from '@/lib/config';

/**
 * Minimal ABI for the agreeToDeal function and relevant custom errors.
 * Including error types lets viem decode revert reasons instead of showing raw hex.
 */
const AGREE_ABI = [
  {
    name: 'agreeToDeal',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [{ name: 'dealId', type: 'uint256' as const }],
    outputs: [],
  },
  {
    name: 'InvalidDealState',
    type: 'error' as const,
    inputs: [
      { name: 'dealId', type: 'uint256' as const },
      { name: 'current', type: 'uint8' as const },
      { name: 'required', type: 'uint8' as const },
    ],
  },
  {
    name: 'Unauthorized',
    type: 'error' as const,
    inputs: [
      { name: 'caller', type: 'address' as const },
      { name: 'expectedRole', type: 'string' as const },
    ],
  },
  {
    name: 'DealNotFound',
    type: 'error' as const,
    inputs: [{ name: 'dealId', type: 'uint256' as const }],
  },
] as const;

/** Each stage of the freelancer's on-chain agree flow. */
export type AgreeOnChainStep =
  | 'idle' //    Not started — show "Agree On-Chain" button
  | 'signing' // Transaction pending MetaMask signature
  | 'mining' //  Tx submitted — waiting for chain confirmation
  | 'done' //    Confirmed — deal is now AGREED on-chain
  | 'error'; //  Failed — show error, allow reset

/** Return type of the useAgreeDealOnchain hook. */
export interface UseAgreeDealOnchainResult {
  /** Current step in the agree flow. */
  step: AgreeOnChainStep;
  /** Human-readable error. Non-null only when step === 'error'. */
  error: string | null;
  /**
   * Sends the agreeToDeal(chainDealId) transaction to MetaMask and waits for confirmation.
   *
   * @param chainDealId - On-chain deal ID (uint256 as decimal string, e.g. "2")
   * @returns Promise<void>
   */
  agree: (chainDealId: string) => Promise<void>;
  /** Resets all state to 'idle'. */
  reset: () => void;
}

/**
 * Hook for the freelancer to call agreeToDeal(chainDealId) on-chain via MetaMask.
 * Exposes simple step state so the UI can show progress and errors.
 *
 * @returns Step state and agree/reset controls
 */
export function useAgreeDealOnchain(): UseAgreeDealOnchainResult {
  const [step, setStep] = useState<AgreeOnChainStep>('idle');
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  /**
   * Resets all state back to idle.
   */
  const reset = useCallback((): void => {
    setStep('idle');
    setError(null);
  }, []);

  /**
   * Translates a caught error into a user-friendly message and sets step to 'error'.
   *
   * @param err - The caught error from writeContractAsync or waitForTransactionReceipt
   */
  const handleError = useCallback((err: unknown): void => {
    let message = 'An unexpected error occurred. Click Reset to try again.';
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (msg.includes('user rejected') || msg.includes('user denied')) {
        message = 'Transaction was rejected in MetaMask.';
      } else if (msg.includes('invaliddealstate') || msg.includes('invalid deal state')) {
        message = 'Deal is not in the expected on-chain state. It may have already been agreed or cancelled.';
      } else if (msg.includes('unauthorized')) {
        message = 'Your wallet is not the freelancer for this deal on-chain.';
      } else if (msg.includes('dealnotfound') || msg.includes('deal not found')) {
        message = 'Deal not found on-chain. Ensure the client has called createDeal first.';
      } else {
        message = err.message;
      }
    }
    setStep('error');
    setError(message);
  }, []);

  /**
   * Calls agreeToDeal(chainDealId) on the OpenEscrow contract via MetaMask.
   * Waits for the transaction to be confirmed on-chain, then sets step to 'done'.
   *
   * @param chainDealId - On-chain deal ID (uint256 as decimal string)
   * @returns Promise<void>
   */
  const agree = useCallback(
    async (chainDealId: string): Promise<void> => {
      if (!publicClient) {
        setStep('error');
        setError('No RPC client available. Ensure your wallet is connected to Sepolia.');
        return;
      }

      setStep('signing');
      setError(null);

      try {
        const txHash = await writeContractAsync({
          address: config.contractAddress,
          abi: AGREE_ABI,
          functionName: 'agreeToDeal',
          args: [BigInt(chainDealId)],
          gas: 100_000n, // agreeToDeal is a simple state change — 100k is ample
        });

        setStep('mining');
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        setStep('done');
      } catch (err) {
        handleError(err);
      }
    },
    [writeContractAsync, publicClient, handleError]
  );

  return { step, error, agree, reset };
}
