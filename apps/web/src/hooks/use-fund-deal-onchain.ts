/**
 * hooks/use-fund-deal-onchain.ts — OpenEscrow Web Dashboard
 *
 * Handles: Orchestrating the client-side on-chain funding flow for a deal.
 *          Sends three sequential MetaMask transactions:
 *            1. createDeal(freelancer, token, milestoneAmounts) → chainDealId
 *            2. approve(contractAddress, totalAmount) on the token contract
 *            3. deposit(chainDealId) on the OpenEscrow contract
 *          Exposes step-by-step state so the UI can render appropriate progress UI.
 *          Extracts chainDealId from the DealCreated event in the createDeal receipt.
 * Does NOT: call the API (caller submits depositTxHash + chainDealId after step === 'done'),
 *            redirect the user, manage auth state, or retry failed transactions automatically.
 *
 * Step sequencing:
 *   idle → creating → create_mining → awaiting_agree
 *                                          ↓ (user confirms freelancer agreed on-chain)
 *                                     approving → approve_mining → depositing → deposit_mining → done
 *
 * The 'awaiting_agree' pause is mandatory: the contract requires DealState.AGREED before deposit.
 * The freelancer must call agreeToDeal(chainDealId) on-chain (e.g. via Etherscan) before
 * the client calls deposit. If deposit is attempted before this, MetaMask will show a revert.
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { useWriteContract, usePublicClient } from 'wagmi';
import { decodeEventLog } from 'viem';
import type { Deal } from '@open-escrow/shared';
import { OnChainDealState } from '@open-escrow/shared';
import { config } from '@/lib/config';

// ─── Minimal contract ABIs ────────────────────────────────────────────────────
// Defined inline with `as const` so viem can infer precise parameter types for
// type-safe contract calls. Only the functions required for this flow are included.
//
// Dependency note: these mirror entries in packages/shared/src/abis/OpenEscrow.json.
// If the contract is redeployed with changed function signatures, update these ABIs.

/**
 * ERC-20 approve ABI — used to authorise the escrow contract to pull tokens.
 * Standard EIP-20 interface, valid for both USDC and USDT.
 */
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'spender', type: 'address' as const },
      { name: 'value', type: 'uint256' as const },
    ],
    outputs: [{ name: '', type: 'bool' as const }],
  },
] as const;

/**
 * OpenEscrow function ABIs and custom error definitions needed for the fund flow.
 * Including error types lets viem decode InvalidDealState / Unauthorized instead of
 * showing raw hex, so handleError can surface a meaningful message to the user.
 */
const ESCROW_ABI = [
  {
    name: 'createDeal',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [
      { name: 'freelancer', type: 'address' as const },
      { name: 'token', type: 'address' as const },
      { name: 'milestoneAmounts', type: 'uint256[]' as const },
    ],
    outputs: [{ name: 'dealId', type: 'uint256' as const }],
  },
  {
    name: 'deposit',
    type: 'function' as const,
    stateMutability: 'nonpayable' as const,
    inputs: [{ name: 'dealId', type: 'uint256' as const }],
    outputs: [],
  },
  // Custom errors — allow viem to decode contract reverts into readable messages.
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

/**
 * Minimal ABI for the getDeal view function — used to read on-chain deal state
 * before calling deposit, ensuring the freelancer has called agreeToDeal first.
 */
const GET_DEAL_ABI = [
  {
    name: 'getDeal',
    type: 'function' as const,
    stateMutability: 'view' as const,
    inputs: [{ name: 'dealId', type: 'uint256' as const }],
    outputs: [
      { name: 'client', type: 'address' as const },
      { name: 'freelancer', type: 'address' as const },
      { name: 'token', type: 'address' as const },
      { name: 'totalAmount', type: 'uint256' as const },
      { name: 'state', type: 'uint8' as const },
      { name: 'releasedAmount', type: 'uint256' as const },
      { name: 'milestoneCount', type: 'uint256' as const },
    ],
  },
] as const;

/**
 * DealCreated event ABI — used to decode chainDealId from the createDeal receipt.
 */
const DEAL_CREATED_EVENT_ABI = [
  {
    name: 'DealCreated',
    type: 'event' as const,
    anonymous: false as const,
    inputs: [
      { indexed: true as const, name: 'dealId', type: 'uint256' as const },
      { indexed: true as const, name: 'client', type: 'address' as const },
      { indexed: true as const, name: 'freelancer', type: 'address' as const },
      { indexed: false as const, name: 'token', type: 'address' as const },
      { indexed: false as const, name: 'totalAmount', type: 'uint256' as const },
      { indexed: false as const, name: 'milestoneCount', type: 'uint256' as const },
    ],
  },
] as const;

// ─── State machine types ──────────────────────────────────────────────────────

/**
 * Each stage of the on-chain fund flow.
 * Stages 'creating' and 'create_mining' only appear when chainDealId was null on entry.
 */
export type AutoFundStep =
  | 'idle' //           Not started — show "Start" button
  | 'creating' //       createDeal tx pending MetaMask signature
  | 'create_mining' //  createDeal tx submitted; waiting for chain confirmation
  | 'awaiting_agree' // createDeal confirmed; freelancer must call agreeToDeal on-chain
  | 'approving' //      approve tx pending MetaMask signature
  | 'approve_mining' // approve tx submitted; waiting for chain confirmation
  | 'depositing' //     deposit tx pending MetaMask signature
  | 'deposit_mining' // deposit tx submitted; waiting for chain confirmation
  | 'done' //           Deposit confirmed — caller should POST to API and redirect
  | 'error'; //         Unrecoverable error — call reset() to try again

/** Return type of the useFundDealOnchain hook. */
export interface UseFundDealOnchainResult {
  /** Current step in the flow. */
  step: AutoFundStep;
  /**
   * On-chain deal ID (uint256 as decimal string) extracted from the DealCreated receipt.
   * Non-null from 'awaiting_agree' through 'done'. Null at 'idle' and 'error'.
   */
  chainDealId: string | null;
  /**
   * Transaction hash of the confirmed deposit.
   * Non-null only when step === 'done'.
   */
  depositTxHash: `0x${string}` | null;
  /** Human-readable error. Non-null only when step === 'error'. */
  error: string | null;
  /**
   * Starts the auto-fund flow: sends createDeal to MetaMask, waits for confirmation,
   * then pauses at 'awaiting_agree' for the freelancer to call agreeToDeal on-chain.
   *
   * @param deal - The deal to fund (must be in AGREED status and have milestones)
   * @returns Promise<void>
   */
  start: (deal: Deal) => Promise<void>;
  /**
   * Resumes after the freelancer has called agreeToDeal on-chain.
   * Sends approve then deposit to MetaMask sequentially, waits for confirmations,
   * then sets step to 'done' with the deposit tx hash ready for API submission.
   *
   * @param deal - The same deal passed to start()
   * @returns Promise<void>
   */
  continueAfterAgree: (deal: Deal) => Promise<void>;
  /** Resets all state to 'idle'. Safe to call at any point. */
  reset: () => void;
  /**
   * Restores the awaiting_agree state from a chainDealId previously stored in the database.
   * Used to recover the fund flow position after a page refresh.
   *
   * @param savedChainDealId - On-chain deal ID from the deal record (deal.chainDealId)
   */
  recover: (savedChainDealId: string) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Manages the sequential on-chain fund flow:
 *   createDeal → [freelancer agrees] → approve → deposit
 *
 * Uses wagmi's useWriteContract for MetaMask transaction signing and the viem
 * public client for awaiting confirmations and decoding event logs.
 *
 * @returns Step-by-step state and control functions for the auto-fund flow
 */
export function useFundDealOnchain(): UseFundDealOnchainResult {
  const [step, setStep] = useState<AutoFundStep>('idle');
  const [chainDealId, setChainDealId] = useState<string | null>(null);
  const [depositTxHash, setDepositTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prevents concurrent async executions from double-clicks before React re-renders.
  // useRef is used (not useState) because the guard must be synchronously visible
  // across both invocations in the same event-loop tick.
  const isInFlight = useRef(false);

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  /**
   * Resets all state to idle. Safe to call at any point to start over.
   */
  const reset = useCallback((): void => {
    setStep('idle');
    setChainDealId(null);
    setDepositTxHash(null);
    setError(null);
  }, []);

  /**
   * Translates a caught error into a user-friendly message and sets step to 'error'.
   *
   * @param err - The caught error from a wagmi write or viem receipt call
   */
  const handleError = useCallback((err: unknown): void => {
    let message = 'An unexpected error occurred. Click Reset to try again.';
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      if (msg.includes('user rejected') || msg.includes('user denied')) {
        message = 'Transaction was rejected in MetaMask. Click Reset to try again.';
      } else if (msg.includes('invaliddealstate') || msg.includes('invalid deal state')) {
        message =
          'Deal is not in the required on-chain state. Ensure the freelancer has called agreeToDeal on-chain first, then click Reset and try again.';
      } else if (msg.includes('gas limit too high') || msg.includes('gas_limit_too_high')) {
        // Sepolia RPC node rejects eth_estimateGas when viem's gas upper-bound is too high.
        // Should not occur with explicit gas limits set on writeContractAsync; if it does,
        // the deal may be in the wrong on-chain state causing estimation to fail.
        message =
          'Gas estimation failed (RPC rejected the request). Ensure the freelancer has called agreeToDeal on-chain, then click Reset and try again.';
      } else if (msg.includes('insufficient') || msg.includes('allowance')) {
        message =
          'Insufficient token balance or allowance. Ensure you hold enough USDC/USDT on Sepolia.';
      } else {
        message = err.message;
      }
    }
    setStep('error');
    setError(message);
  }, []);

  /**
   * Executes the approve + deposit sequence after the deal is in AGREED state on-chain.
   * Intended to be called internally by start() (when skipping createDeal) and
   * by continueAfterAgree() (after the user confirms the freelancer has agreed).
   *
   * @param deal         - Deal being funded
   * @param resolvedId   - On-chain deal ID (from createDeal or passed in)
   * @returns Promise<void>
   */
  const doApproveAndDeposit = useCallback(
    async (deal: Deal, resolvedId: string): Promise<void> => {
      if (!publicClient) {
        setStep('error');
        setError('No RPC client available. Ensure your wallet is connected to Sepolia.');
        return;
      }

      try {
        // ── Verify on-chain deal state is AGREED before spending gas ─────────
        // If the freelancer hasn't called agreeToDeal on-chain, deposit will revert.
        // This read-only check catches that case with a clear error before any tx.
        const onChainDeal = await publicClient.readContract({
          address: config.contractAddress,
          abi: GET_DEAL_ABI,
          functionName: 'getDeal',
          args: [BigInt(resolvedId)],
        });

        // onChainDeal is a readonly tuple — named elements are not accessible by name in TS,
        // index 4 is the 'state' field per GET_DEAL_ABI outputs order.
        const onChainDealState = onChainDeal[4];
        if (onChainDealState !== OnChainDealState.AGREED) {
          const stateLabel =
            onChainDealState === OnChainDealState.DRAFT
              ? 'DRAFT (freelancer has not agreed on-chain yet)'
              : `state ${String(onChainDealState)}`;
          setStep('error');
          setError(
            `Deal #${resolvedId} is still ${stateLabel}. ` +
              `The freelancer must open the deal page and click "Agree On-Chain" first, ` +
              `then come back and click Continue.`
          );
          return;
        }

        // ── approve ─────────────────────────────────────────────────────────
        setStep('approving');

        const approveTxHash = await writeContractAsync({
          address: deal.tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [config.contractAddress, BigInt(deal.totalAmount)],
          gas: 100_000n, // explicit limit — avoids eth_estimateGas hitting publicnode's gas cap
        });

        setStep('approve_mining');
        await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

        // ── deposit ──────────────────────────────────────────────────────────
        setStep('depositing');

        const depositHash = await writeContractAsync({
          address: config.contractAddress,
          abi: ESCROW_ABI,
          functionName: 'deposit',
          args: [BigInt(resolvedId)],
          gas: 200_000n, // explicit limit — avoids eth_estimateGas hitting publicnode's gas cap
        });

        setStep('deposit_mining');
        setDepositTxHash(depositHash);
        await publicClient.waitForTransactionReceipt({ hash: depositHash });

        setStep('done');
      } catch (err) {
        handleError(err);
      }
    },
    [writeContractAsync, publicClient, handleError]
  );

  /**
   * Starts the auto-fund flow from the beginning.
   * Sends createDeal to MetaMask, waits for receipt, extracts chainDealId from logs,
   * then halts at 'awaiting_agree' for the freelancer to agree on-chain.
   *
   * @param deal - The deal to fund (AGREED status, milestones present)
   * @returns Promise<void>
   */
  const start = useCallback(
    async (deal: Deal): Promise<void> => {
      if (isInFlight.current) return;
      isInFlight.current = true;
      try {
        if (!publicClient) {
          setStep('error');
          setError('No RPC client available. Ensure your wallet is connected to Sepolia.');
          return;
        }

        reset();

        // ── createDeal ────────────────────────────────────────────────────────
        setStep('creating');

        const milestoneAmounts = [...deal.milestones]
          .sort((a, b) => a.sequence - b.sequence)
          .map((m) => BigInt(m.amount));

        const createTxHash = await writeContractAsync({
          address: config.contractAddress,
          abi: ESCROW_ABI,
          functionName: 'createDeal',
          args: [
            deal.freelancerAddress as `0x${string}`,
            deal.tokenAddress as `0x${string}`,
            milestoneAmounts,
          ],
          // 300k covers struct + milestone array storage init; scales with milestone count
          gas: BigInt(300_000 + deal.milestones.length * 50_000),
        });

        setStep('create_mining');
        const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createTxHash });

        // ── Extract chainDealId from DealCreated event ────────────────────────
        let resolvedChainDealId: string | null = null;
        for (const log of createReceipt.logs) {
          try {
            const decoded = decodeEventLog({
              abi: DEAL_CREATED_EVENT_ABI,
              eventName: 'DealCreated',
              topics: log.topics,
              data: log.data,
            });
            resolvedChainDealId = decoded.args.dealId.toString();
            break;
          } catch {
            // Not this event — try next log entry
          }
        }

        if (!resolvedChainDealId) {
          setStep('error');
          setError(
            'Could not extract the on-chain deal ID from the transaction receipt. ' +
              'Note the createDeal tx hash and use the manual flow to enter the chain deal ID.'
          );
          return;
        }

        setChainDealId(resolvedChainDealId);
        // Pause: freelancer must call agreeToDeal(resolvedChainDealId) on-chain before deposit
        setStep('awaiting_agree');
      } catch (err) {
        handleError(err);
      } finally {
        isInFlight.current = false;
      }
    },
    [writeContractAsync, publicClient, reset, handleError]
  );

  /**
   * Resumes the flow after the user confirms the freelancer has agreed on-chain.
   * Proceeds with approve → deposit. If chainDealId is missing, resets to error.
   *
   * @param deal - The same deal passed to start()
   * @returns Promise<void>
   */
  const continueAfterAgree = useCallback(
    async (deal: Deal): Promise<void> => {
      if (isInFlight.current) return;
      isInFlight.current = true;
      try {
        if (!chainDealId) {
          setStep('error');
          setError('Chain deal ID is missing. Please reset and start the flow again.');
          return;
        }
        await doApproveAndDeposit(deal, chainDealId);
      } finally {
        isInFlight.current = false;
      }
    },
    [chainDealId, doApproveAndDeposit]
  );

  /**
   * Restores awaiting_agree state from a previously recorded chainDealId.
   * Safe to call when step is 'idle' and deal.chainDealId is non-null (page refresh recovery).
   *
   * @param savedChainDealId - On-chain deal ID from deal.chainDealId in the database
   */
  const recover = useCallback((savedChainDealId: string): void => {
    setStep('awaiting_agree');
    setChainDealId(savedChainDealId);
    setDepositTxHash(null);
    setError(null);
  }, []);

  return { step, chainDealId, depositTxHash, error, start, continueAfterAgree, reset, recover };
}
