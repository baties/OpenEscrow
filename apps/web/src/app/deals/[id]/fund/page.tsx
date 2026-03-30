/**
 * deals/[id]/fund/page.tsx — OpenEscrow Web Dashboard
 *
 * Fund Deal page — guides the client through the on-chain funding flow.
 * Handles: displaying the contract address + amount to deposit,
 *          capturing the transaction hash after the on-chain deposit,
 *          calling the API to confirm funding, redirecting to deal detail on success.
 * Does NOT: execute the on-chain transaction directly (user does this in their wallet),
 *            manage auth state, or call the API directly.
 *
 * Flow:
 * 1. Show client the contract address and amount to approve + deposit
 * 2. Client executes the on-chain tx in their wallet
 * 3. Client pastes the tx hash into this form
 * 4. Form validates and calls POST /deals/:id/fund
 * 5. Redirects to /deals/:id on success
 *
 * Note: The API indexer will also detect the on-chain event and update state
 * automatically within 12s, but this form provides immediate confirmation.
 */

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useDeal } from '@/hooks/use-deal';
import { useDealActions } from '@/hooks/use-deal-actions';
import { fundDealSchema } from '@/lib/schemas';
import { formatTokenAmount, truncateAddress } from '@/lib/format';
import { config } from '@/lib/config';
import { ErrorAlert } from '@/components/ErrorAlert';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { StatusBadge } from '@/components/StatusBadge';

/**
 * Fund Deal page component.
 * Only accessible to authenticated clients whose deal is in AGREED status.
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

  const [txHash, setTxHash] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [step, setStep] = useState<'instructions' | 'confirm'>('instructions');

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  // Redirect if deal is not in fundable state
  useEffect(() => {
    if (deal && deal.status !== 'AGREED') {
      router.replace(`/deals/${deal.id}`);
    }
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

  // Only the client can fund
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

  /**
   * Validates the tx hash input and calls the fund API.
   */
  async function handleConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldError(null);

    const result = fundDealSchema.safeParse({ txHash });
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message ?? 'Invalid transaction hash');
      return;
    }

    // deal is non-null here: guarded by `if (!deal) return null` above
    const updated = await fundDeal(deal!.id, result.data.txHash);
    if (updated) {
      router.push(`/deals/${deal!.id}`);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href={`/deals/${deal.id}`} className="text-sm text-indigo-600 hover:underline">
          ← Back to Deal
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Fund Deal</h1>
        <div className="mt-1 flex items-center gap-2">
          <StatusBadge status={deal.status} />
          <span className="text-sm text-gray-500">
            {formatTokenAmount(deal.totalAmount)} USDC/T required
          </span>
        </div>
      </div>

      {step === 'instructions' ? (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-900">Step 1: Approve & Deposit</h2>
          <p className="text-sm text-gray-600">
            You need to approve the OpenEscrow contract to spend your tokens, then call the deposit
            function. Use your wallet or a tool like Etherscan to complete these two transactions.
          </p>

          {/* Contract info */}
          <div className="rounded-lg bg-gray-50 p-4 space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Contract Address
              </p>
              <p className="mt-0.5 font-mono text-gray-900 break-all">{config.contractAddress}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Freelancer Address
              </p>
              <p className="mt-0.5 font-mono text-gray-700">
                {truncateAddress(deal.freelancerAddress, 6, 6)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Amount to Deposit
              </p>
              <p className="mt-0.5 font-semibold text-gray-900">
                {formatTokenAmount(deal.totalAmount)} USDC/T
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                Chain Deal ID (from contract)
              </p>
              <p className="mt-0.5 font-mono text-gray-700">
                {deal.chainDealId ?? 'Not yet created on-chain — complete the deposit first'}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            <strong>Testnet only.</strong> Ensure you are connected to Sepolia and using the correct
            test token addresses.
          </div>

          <button
            type="button"
            onClick={() => setStep('confirm')}
            className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            I have completed the deposit →
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-900">Step 2: Confirm Transaction</h2>
          <p className="text-sm text-gray-600">
            Paste the transaction hash from your deposit transaction. The API will verify and update
            the deal status to FUNDED.
          </p>

          <form
            onSubmit={(e) => {
              void handleConfirm(e);
            }}
            className="space-y-4"
          >
            <div>
              <label htmlFor="txHash" className="block text-sm font-medium text-gray-700">
                Transaction Hash <span className="text-red-500">*</span>
              </label>
              <input
                id="txHash"
                type="text"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder="0x..."
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                disabled={fundState.isLoading}
              />
              {fieldError && <p className="mt-1 text-xs text-red-600">{fieldError}</p>}
            </div>

            <ErrorAlert message={fundState.error} />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep('instructions')}
                disabled={fundState.isLoading}
                className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={fundState.isLoading}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {fundState.isLoading && <LoadingSpinner size="sm" />}
                Confirm Funding
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
