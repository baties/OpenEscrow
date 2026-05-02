/**
 * deals/[id]/fund/page.tsx — OpenEscrow Web Dashboard
 *
 * Fund Deal page — lets the client deposit funds into the escrow contract via two modes:
 *
 *   Manual mode:
 *     User performs on-chain steps (createDeal, agreeToDeal, approve, deposit) themselves
 *     using Etherscan or their wallet, then pastes the deposit tx hash + chainDealId here.
 *
 *   MetaMask Auto mode (new):
 *     The app creates each transaction and sends it to MetaMask for signing.
 *     Sequence: createDeal → [freelancer agrees on-chain] → approve → deposit.
 *     On deposit confirmation, the txHash + chainDealId are submitted to the API automatically.
 *
 * Handles: mode selection, rendering the correct step UI per mode, API confirmation, redirect.
 * Does NOT: execute on-chain transactions directly (delegated to useFundDealOnchain hook),
 *            manage auth state, or call the API directly (via useDealActions + api-client).
 */

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useDeal } from '@/hooks/use-deal';
import { useDealActions } from '@/hooks/use-deal-actions';
import { useFundDealOnchain } from '@/hooks/use-fund-deal-onchain';
import { fundDealSchema } from '@/lib/schemas';
import { formatTokenAmount, truncateAddress } from '@/lib/format';
import { config } from '@/lib/config';
import { ErrorAlert } from '@/components/ErrorAlert';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { StatusBadge } from '@/components/StatusBadge';

// ─── Step label map (auto mode) ───────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  creating: 'Creating deal on-chain… (check MetaMask)',
  create_mining: 'Waiting for createDeal confirmation…',
  awaiting_agree: 'Deal created on-chain',
  approving: 'Approving token transfer… (check MetaMask)',
  approve_mining: 'Waiting for approval confirmation…',
  depositing: 'Depositing funds… (check MetaMask)',
  deposit_mining: 'Waiting for deposit confirmation…',
  submitting: 'Recording funding on the server…',
  done: 'Deal funded successfully!',
};

// ─── Page component ───────────────────────────────────────────────────────────

/**
 * Fund Deal page — only accessible to the deal's client when status is AGREED.
 *
 * @returns Fund deal page JSX
 */
export default function FundDealPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = typeof params['id'] === 'string' ? params['id'] : null;

  const { isAuthenticated, walletAddress } = useAuth();
  const { deal, isLoading: isDealLoading, error: dealError } = useDeal(dealId);
  const { fundDeal, fundState } = useDealActions();
  const onchain = useFundDealOnchain();

  // Which mode the user has selected
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');

  // Manual mode form state
  const [txHashInput, setTxHashInput] = useState('');
  const [chainDealIdInput, setChainDealIdInput] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // After auto-mode deposit is confirmed, immediately submit to API
  useEffect(() => {
    if (onchain.step !== 'done' || !deal || !onchain.depositTxHash || !onchain.chainDealId) return;
    void fundDeal(deal.id, onchain.depositTxHash, onchain.chainDealId).then((updated) => {
      if (updated) router.push(`/deals/${deal.id}`);
    });
  }, [onchain.step, onchain.depositTxHash, onchain.chainDealId, deal, fundDeal, router]);

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated) router.replace('/');
  }, [isAuthenticated, router]);

  // Redirect if deal is no longer fundable
  useEffect(() => {
    if (deal && deal.status !== 'AGREED') router.replace(`/deals/${deal.id}`);
  }, [deal, router]);

  if (!isAuthenticated || !walletAddress) return null;

  if (isDealLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner size="lg" label="Loading deal..." />
      </div>
    );
  }

  if (dealError) {
    return (
      <div className="space-y-4">
        <Link href="/deals" className="text-sm text-indigo-600 hover:underline">
          ← Back to My Deals
        </Link>
        <ErrorAlert message={dealError} />
      </div>
    );
  }

  if (!deal) return null;

  const isClient = deal.clientAddress.toLowerCase() === walletAddress.toLowerCase();
  if (!isClient) {
    return (
      <div className="space-y-4">
        <Link href={`/deals/${deal.id}`} className="text-sm text-indigo-600 hover:underline">
          ← Back to Deal
        </Link>
        <ErrorAlert message="Only the deal client can fund this deal." />
      </div>
    );
  }

  // ── Manual mode: submit handler ─────────────────────────────────────────────

  /**
   * Validates manual form inputs and calls the API to record funding.
   *
   * @param e - Form submit event
   */
  async function handleManualConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});

    const result = fundDealSchema.safeParse({
      transactionHash: txHashInput,
      chainDealId: chainDealIdInput,
    });
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0]?.toString() ?? 'unknown';
        errs[field] = issue.message;
      }
      setFieldErrors(errs);
      return;
    }

    if (!deal) return;
    const updated = await fundDeal(deal.id, result.data.transactionHash, result.data.chainDealId);
    if (updated) {
      router.push(`/deals/${deal.id}`);
    }
  }

  // ── Shared deal info box ────────────────────────────────────────────────────

  const tokenSymbol =
    deal.tokenAddress.toLowerCase() === config.usdcAddress.toLowerCase() ? 'USDC' : 'USDT';

  const dealInfoBox = (
    <div className="rounded-lg bg-gray-50 p-4 space-y-3 text-sm">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          Contract Address
        </p>
        <p className="mt-0.5 font-mono text-gray-900 break-all">{config.contractAddress}</p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Token</p>
        <p className="mt-0.5 font-mono text-gray-700">
          {tokenSymbol} — {deal.tokenAddress}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Freelancer</p>
        <p className="mt-0.5 font-mono text-gray-700">
          {truncateAddress(deal.freelancerAddress, 6, 6)}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
          Amount to Deposit
        </p>
        <p className="mt-0.5 font-semibold text-gray-900">
          {formatTokenAmount(deal.totalAmount)} {tokenSymbol}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Milestones</p>
        <p className="mt-0.5 text-gray-700">
          {deal.milestones.length} milestone{deal.milestones.length !== 1 ? 's' : ''}
          {deal.milestones.map((m, i) => (
            <span key={m.id} className="ml-1 text-xs text-gray-400">
              {i > 0 ? ', ' : '('}
              {formatTokenAmount(m.amount)}
              {i === deal.milestones.length - 1 ? ')' : ''}
            </span>
          ))}
        </p>
      </div>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Header */}
      <div>
        <Link href={`/deals/${deal.id}`} className="text-sm text-indigo-600 hover:underline">
          ← Back to Deal
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Fund Deal</h1>
        <div className="mt-1 flex items-center gap-2">
          <StatusBadge status={deal.status} />
          <span className="text-sm text-gray-500">
            {formatTokenAmount(deal.totalAmount)} {tokenSymbol} required
          </span>
        </div>
      </div>

      {/* Testnet warning */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
        <strong>Testnet only.</strong> Ensure you are on Sepolia and using test tokens only.
      </div>

      {/* Mode selector tabs */}
      <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            mode === 'manual'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Manual
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('auto');
            onchain.reset();
          }}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            mode === 'auto'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          MetaMask Auto
        </button>
      </div>

      {/* ── Manual mode ─────────────────────────────────────────────────────── */}
      {mode === 'manual' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-5">
          <div>
            <h2 className="font-semibold text-gray-900">Manual Flow</h2>
            <p className="mt-1 text-sm text-gray-600">
              Perform the on-chain steps yourself using Etherscan or your wallet, then confirm here.
            </p>
          </div>

          {dealInfoBox}

          <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
            <li>
              Call <code className="rounded bg-gray-100 px-1 font-mono text-xs">createDeal</code> on
              the contract — note the returned <strong>Deal ID</strong>
            </li>
            <li>
              Ask the freelancer to call{' '}
              <code className="rounded bg-gray-100 px-1 font-mono text-xs">
                agreeToDeal(dealId)
              </code>
            </li>
            <li>
              Call{' '}
              <code className="rounded bg-gray-100 px-1 font-mono text-xs">
                approve(contractAddress, amount)
              </code>{' '}
              on the token contract
            </li>
            <li>
              Call{' '}
              <code className="rounded bg-gray-100 px-1 font-mono text-xs">deposit(dealId)</code> —
              save the <strong>tx hash</strong>
            </li>
          </ol>

          <form
            onSubmit={(e) => {
              void handleManualConfirm(e);
            }}
            className="space-y-4"
          >
            <div>
              <label htmlFor="transactionHash" className="block text-sm font-medium text-gray-700">
                Deposit Transaction Hash <span className="text-red-500">*</span>
              </label>
              <input
                id="transactionHash"
                type="text"
                value={txHashInput}
                onChange={(e) => setTxHashInput(e.target.value)}
                placeholder="0x..."
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                disabled={fundState.isLoading}
              />
              {fieldErrors['transactionHash'] && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors['transactionHash']}</p>
              )}
            </div>

            <div>
              <label htmlFor="chainDealId" className="block text-sm font-medium text-gray-700">
                On-Chain Deal ID <span className="text-red-500">*</span>
              </label>
              <p className="mt-0.5 text-xs text-gray-500">
                The integer returned by <code className="font-mono">createDeal()</code> — visible in
                the transaction receipt or the contract's DealCreated event.
              </p>
              <input
                id="chainDealId"
                type="text"
                value={chainDealIdInput}
                onChange={(e) => setChainDealIdInput(e.target.value)}
                placeholder="e.g. 42"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                disabled={fundState.isLoading}
              />
              {fieldErrors['chainDealId'] && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors['chainDealId']}</p>
              )}
            </div>

            <ErrorAlert message={fundState.error} />

            <button
              type="submit"
              disabled={fundState.isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {fundState.isLoading && <LoadingSpinner size="sm" />}
              Confirm Funding
            </button>
          </form>
        </div>
      )}

      {/* ── Auto mode ───────────────────────────────────────────────────────── */}
      {mode === 'auto' && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-5">
          <div>
            <h2 className="font-semibold text-gray-900">MetaMask Auto Flow</h2>
            <p className="mt-1 text-sm text-gray-600">
              The app creates each transaction automatically. MetaMask will pop up for each
              signature — you only need to confirm.
            </p>
          </div>

          {dealInfoBox}

          {/* Step indicator */}
          <div className="space-y-2">
            {[
              {
                id: 'create',
                label: 'Create deal on-chain',
                steps: ['creating', 'create_mining', 'awaiting_agree'],
              },
              { id: 'agree', label: 'Freelancer agrees on-chain', steps: ['awaiting_agree'] },
              {
                id: 'approve',
                label: 'Approve token transfer',
                steps: ['approving', 'approve_mining'],
              },
              {
                id: 'deposit',
                label: 'Deposit funds',
                steps: ['depositing', 'deposit_mining', 'done'],
              },
            ].map(({ id, label, steps }) => {
              const isActive = steps.includes(onchain.step);
              const isDone =
                (id === 'create' &&
                  [
                    'awaiting_agree',
                    'approving',
                    'approve_mining',
                    'depositing',
                    'deposit_mining',
                    'done',
                  ].includes(onchain.step)) ||
                (id === 'agree' &&
                  ['approving', 'approve_mining', 'depositing', 'deposit_mining', 'done'].includes(
                    onchain.step
                  )) ||
                (id === 'approve' &&
                  ['depositing', 'deposit_mining', 'done'].includes(onchain.step)) ||
                (id === 'deposit' && onchain.step === 'done');
              return (
                <div key={id} className="flex items-center gap-3">
                  <div
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isDone
                        ? 'bg-emerald-100 text-emerald-700'
                        : isActive
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {isDone
                      ? '✓'
                      : id === 'create'
                        ? '1'
                        : id === 'agree'
                          ? '2'
                          : id === 'approve'
                            ? '3'
                            : '4'}
                  </div>
                  <span
                    className={`text-sm ${
                      isDone
                        ? 'text-emerald-700'
                        : isActive
                          ? 'font-medium text-gray-900'
                          : 'text-gray-400'
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* ── Status messages per step ──────────────────────────────────── */}

          {onchain.step === 'idle' && (
            <button
              type="button"
              onClick={() => {
                void onchain.start(deal);
              }}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Start Auto-Fund via MetaMask
            </button>
          )}

          {['creating', 'create_mining'].includes(onchain.step) && (
            <div className="flex items-center gap-3 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-700">
              <LoadingSpinner size="sm" />
              <span>{STEP_LABELS[onchain.step]}</span>
            </div>
          )}

          {onchain.step === 'awaiting_agree' && (
            <div className="space-y-3">
              <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                <p className="font-medium">✓ Deal created on-chain</p>
                <p className="mt-1">
                  On-chain Deal ID:{' '}
                  <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono font-bold">
                    {onchain.chainDealId}
                  </code>
                </p>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-medium">Waiting for freelancer to agree on-chain</p>
                <p className="mt-1">
                  The freelancer must call{' '}
                  <code className="rounded bg-amber-100 px-1 font-mono">
                    agreeToDeal({onchain.chainDealId})
                  </code>{' '}
                  on the contract at{' '}
                  <a
                    href={`${config.chainMeta.explorerUrl}/address/${config.contractAddress}#writeContract`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Etherscan
                  </a>{' '}
                  before you can deposit.
                </p>
                <p className="mt-2 text-xs text-amber-600">
                  Share the chain deal ID <strong>{onchain.chainDealId}</strong> with your
                  freelancer. Once they have agreed, click Continue.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  void onchain.continueAfterAgree(deal);
                }}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Continue — Freelancer has agreed on-chain
              </button>
            </div>
          )}

          {['approving', 'approve_mining', 'depositing', 'deposit_mining'].includes(
            onchain.step
          ) && (
            <div className="flex items-center gap-3 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-700">
              <LoadingSpinner size="sm" />
              <span>{STEP_LABELS[onchain.step]}</span>
            </div>
          )}

          {onchain.step === 'done' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-700">
                <LoadingSpinner size="sm" />
                <span>{STEP_LABELS['submitting']}</span>
              </div>
              {fundState.error && <ErrorAlert message={fundState.error} />}
            </div>
          )}

          {onchain.step === 'error' && (
            <div className="space-y-3">
              <ErrorAlert message={onchain.error} />
              <button
                type="button"
                onClick={onchain.reset}
                className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Reset and Try Again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
