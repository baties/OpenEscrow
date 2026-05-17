/**
 * hooks/use-approve-milestone-onchain.ts — OpenEscrow Web Dashboard
 *
 * Handles: Sending the client's on-chain approveMilestone(chainDealId, milestoneIndex)
 *          transaction via MetaMask. Transfers tokens from the escrow contract directly
 *          to the freelancer's wallet upon confirmation.
 * Does NOT: call the API to update deal state (caller does that after on-chain confirmation),
 *            manage auth state, or handle rejection.
 *
 * Step sequence: idle → signing → mining → done | error
 */

'use client';

import { useState, useCallback } from 'react';
import { useWriteContract, usePublicClient } from 'wagmi';
import { config } from '@/lib/config';

/**
 * Minimal ABI for approveMilestone and the custom errors it can revert with.
 * Including error types lets viem decode revert reasons into readable messages.
 */
const APPROVE_ABI = [
  {
    name: 'approveMilestone',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'dealId', type: 'uint256' as const },
      { name: 'milestoneIndex', type: 'uint256' as const },
    ],
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
    name: 'InvalidMilestoneState',
    type: 'error' as const,
    inputs: [
      { name: 'dealId', type: 'uint256' as const },
      { name: 'milestoneIndex', type: 'uint256' as const },
      { name: 'current', type: 'uint8' as const },
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
] as const;

/** Steps in the on-chain milestone approval flow. */
export type ApproveMilestoneStep =
  | 'idle' //    Not started
  | 'signing' // Transaction pending MetaMask signature
  | 'mining' //  Tx submitted — waiting for chain confirmation
  | 'done' //    Confirmed — tokens transferred to freelancer
  | 'error'; //  Failed — show error, allow reset

/** Return type of the useApproveMilestoneOnchain hook. */
export interface UseApproveMilestoneOnchainResult {
  /** Current step in the approve flow. */
  step: ApproveMilestoneStep;
  /** ID of the milestone currently being approved on-chain. Null when idle/done/error. */
  activeMilestoneId: string | null;
  /** Human-readable error. Non-null only when step === 'error'. */
  error: string | null;
  /**
   * Sends approveMilestone(chainDealId, milestoneIndex) to MetaMask and waits for confirmation.
   * Returns true on success, false if the tx was rejected or reverted (error state is set).
   *
   * @param milestoneId - DB UUID of the milestone (used to track activeMilestoneId)
   * @param chainDealId - On-chain deal ID (uint256 as decimal string, e.g. "3")
   * @param milestoneIndex - 0-based milestone index in the contract (sequence - 1)
   * @returns Promise<boolean> — true if confirmed on-chain, false if rejected/error
   */
  approve: (milestoneId: string, chainDealId: string, milestoneIndex: number) => Promise<boolean>;
  /** Resets all state to 'idle'. */
  reset: () => void;
}

/**
 * Hook for the client to call approveMilestone(chainDealId, milestoneIndex) on-chain via MetaMask.
 * On success, the contract transfers escrow tokens directly to the freelancer's wallet.
 * Call milestonesApi.approve() after this returns true to sync the DB.
 *
 * @returns Step state, active milestone tracker, and approve/reset controls
 */
export function useApproveMilestoneOnchain(): UseApproveMilestoneOnchainResult {
  const [step, setStep] = useState<ApproveMilestoneStep>('idle');
  const [activeMilestoneId, setActiveMilestoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  /**
   * Resets all state to idle.
   */
  const reset = useCallback((): void => {
    setStep('idle');
    setActiveMilestoneId(null);
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
      } else if (msg.includes('invalidmilestonestate') || msg.includes('invalid milestone state')) {
        message = 'Milestone is not in SUBMITTED state on-chain. It may already be approved.';
      } else if (msg.includes('invaliddealstate') || msg.includes('invalid deal state')) {
        message = 'Deal is not in FUNDED state on-chain.';
      } else if (msg.includes('unauthorized')) {
        message = 'Your wallet is not the client for this deal on-chain.';
      } else {
        message = err.message;
      }
    }
    setStep('error');
    setError(message);
  }, []);

  /**
   * Sends approveMilestone(chainDealId, milestoneIndex) to MetaMask and waits for chain confirmation.
   * The contract transfers escrow tokens to the freelancer's wallet on success.
   *
   * @param milestoneId - DB UUID of the milestone (tracks which card shows loading)
   * @param chainDealId - On-chain deal ID as decimal string
   * @param milestoneIndex - 0-based contract index (DB sequence - 1)
   * @returns true if the tx was confirmed, false if it failed or was rejected
   */
  const approve = useCallback(
    async (milestoneId: string, chainDealId: string, milestoneIndex: number): Promise<boolean> => {
      if (!publicClient) {
        setStep('error');
        setError('No RPC client available. Ensure your wallet is connected to Sepolia.');
        return false;
      }

      setStep('signing');
      setActiveMilestoneId(milestoneId);
      setError(null);

      try {
        const txHash = await writeContractAsync({
          address: config.contractAddress,
          abi: APPROVE_ABI,
          functionName: 'approveMilestone',
          args: [BigInt(chainDealId), BigInt(milestoneIndex)],
          gas: 150_000n,
        });

        setStep('mining');
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        setStep('done');
        return true;
      } catch (err) {
        handleError(err);
        return false;
      }
    },
    [writeContractAsync, publicClient, handleError]
  );

  return { step, activeMilestoneId, error, approve, reset };
}
