/**
 * deals/new/page.tsx — OpenEscrow Web Dashboard
 *
 * Create Deal page — allows a client to create a new deal with milestones.
 * Handles: multi-milestone form state, Zod validation, API call via useDealActions,
 *          on-chain freelancer wallet validation (tx count + token balances via viem),
 *          redirecting to the new deal's detail page on success.
 * Does NOT: manage auth state, interact with the smart contract directly,
 *            call the API directly.
 *
 * Only accessible to authenticated users. Non-authenticated users are redirected to /.
 * Role enforcement: the API will reject if the caller is not a valid client
 * (i.e., if they try to create a deal with themselves as freelancer).
 */

'use client';

import { useState, useEffect } from 'react';
import { isAddress } from 'viem';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useDealActions } from '@/hooks/use-deal-actions';
import { useWalletInfo } from '@/hooks/use-wallet-info';
import { createDealSchema, type CreateDealFormValues, type MilestoneInput } from '@/lib/schemas';
import { parseTokenAmount } from '@/lib/format';
import { config as appConfig } from '@/lib/config';
import { ErrorAlert } from '@/components/ErrorAlert';
import { LoadingSpinner } from '@/components/LoadingSpinner';

/** Empty milestone template for the form */
const EMPTY_MILESTONE: MilestoneInput = {
  title: '',
  description: '',
  acceptanceCriteria: '',
  amount: '',
};

/**
 * Create Deal page component.
 * Redirects unauthenticated users to home.
 * On successful creation, redirects to /deals/[id].
 *
 * @returns Create deal form page JSX
 */
export default function NewDealPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { createDeal, createState } = useDealActions();

  // Form state
  const [freelancerAddress, setFreelancerAddress] = useState('');
  const [tokenAddress, setTokenAddress] = useState(appConfig.usdcAddress);
  const [milestones, setMilestones] = useState<MilestoneInput[]>([{ ...EMPTY_MILESTONE }]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // On-chain wallet info — fetched when a valid address is entered (debounced 600ms)
  const {
    info: walletInfo,
    isLoading: walletInfoLoading,
    error: walletInfoError,
  } = useWalletInfo(freelancerAddress);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  /**
   * Adds an empty milestone to the form.
   */
  function addMilestone() {
    if (milestones.length >= 20) return;
    setMilestones((prev) => [...prev, { ...EMPTY_MILESTONE }]);
  }

  /**
   * Removes a milestone at the given index.
   *
   * @param index - Index of the milestone to remove
   */
  function removeMilestone(index: number) {
    if (milestones.length <= 1) return;
    setMilestones((prev) => prev.filter((_, i) => i !== index));
  }

  /**
   * Updates a field in a specific milestone.
   *
   * @param index - Milestone index
   * @param field - Field name to update
   * @param value - New value for the field
   */
  function updateMilestone(index: number, field: keyof MilestoneInput, value: string) {
    setMilestones((prev) => {
      const updated = [...prev];
      const current = updated[index];
      if (current) {
        updated[index] = { ...current, [field]: value };
      }
      return updated;
    });
  }

  /**
   * Handles form submission: validates with Zod, then calls createDeal.
   */
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFieldErrors({});

    const result = createDealSchema.safeParse({
      freelancerAddress,
      tokenAddress,
      milestones,
    });

    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const pathKey = issue.path.join('.');
        errors[pathKey] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    // Convert human-readable amounts to raw token units
    const formValues: CreateDealFormValues = result.data;
    const apiPayload = {
      freelancerAddress: formValues.freelancerAddress,
      tokenAddress: formValues.tokenAddress,
      milestones: formValues.milestones.map((m) => ({
        ...m,
        amount: parseTokenAmount(m.amount),
      })),
    };

    const deal = await createDeal(apiPayload);
    if (deal) {
      router.push(`/deals/${deal.id}`);
    }
  }

  if (!isAuthenticated) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <Link href="/deals" className="text-sm text-indigo-600 hover:underline">
          ← Back to My Deals
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Create New Deal</h1>
        <p className="mt-1 text-sm text-gray-500">
          Define milestones and invite a freelancer. The freelancer must agree before you fund.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="space-y-6"
      >
        {/* Deal details */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900">Deal Details</h2>

          {/* Freelancer address */}
          <div className="mt-4">
            <label htmlFor="freelancerAddress" className="block text-sm font-medium text-gray-700">
              Freelancer Wallet Address <span className="text-red-500">*</span>
            </label>
            <input
              id="freelancerAddress"
              type="text"
              value={freelancerAddress}
              onChange={(e) => setFreelancerAddress(e.target.value)}
              placeholder="0x..."
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              disabled={createState.isLoading}
            />
            {fieldErrors['freelancerAddress'] && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors['freelancerAddress']}</p>
            )}

            {/* Wallet info panel — shown after a valid address is entered */}
            {freelancerAddress && isAddress(freelancerAddress) && (
              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs">
                {walletInfoLoading && (
                  <span className="flex items-center gap-1.5 text-gray-400">
                    <LoadingSpinner size="sm" />
                    Looking up wallet on {appConfig.chainMeta.name}…
                  </span>
                )}
                {walletInfoError && !walletInfoLoading && (
                  <span className="text-amber-600">
                    ⚠ Could not fetch wallet info — RPC may be unavailable.
                  </span>
                )}
                {walletInfo && !walletInfoLoading && (
                  <dl className="grid grid-cols-3 gap-x-4 gap-y-1">
                    <div>
                      {/* Sent Txns = EVM nonce (outgoing transactions only, not incoming) */}
                      <dt
                        className="text-gray-400 font-medium"
                        title="Number of transactions sent from this address (outgoing only)"
                      >
                        Sent Txns
                      </dt>
                      <dd className="font-semibold text-gray-700">
                        {walletInfo.sentTxCount.toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-400 font-medium">USDC balance</dt>
                      <dd className="font-semibold text-gray-700">{walletInfo.usdcBalance}</dd>
                    </div>
                    <div>
                      <dt className="text-gray-400 font-medium">USDT balance</dt>
                      <dd className="font-semibold text-gray-700">{walletInfo.usdtBalance}</dd>
                    </div>
                  </dl>
                )}
              </div>
            )}
            {freelancerAddress && !isAddress(freelancerAddress) && (
              <p className="mt-1 text-xs text-amber-600">
                Not a valid EVM address — must start with 0x and be 42 characters.
              </p>
            )}
          </div>

          {/* Token selection */}
          <div className="mt-4">
            <label htmlFor="tokenAddress" className="block text-sm font-medium text-gray-700">
              Payment Token <span className="text-red-500">*</span>
            </label>
            <select
              id="tokenAddress"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value as `0x${string}`)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              disabled={createState.isLoading}
            >
              <option value={appConfig.usdcAddress}>USDC ({appConfig.chainMeta.shortName})</option>
              <option value={appConfig.usdtAddress}>USDT ({appConfig.chainMeta.shortName})</option>
            </select>
            {fieldErrors['tokenAddress'] && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors['tokenAddress']}</p>
            )}
          </div>
        </section>

        {/* Milestones */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">
              Milestones{' '}
              <span className="text-sm font-normal text-gray-400">({milestones.length}/20)</span>
            </h2>
            <button
              type="button"
              onClick={addMilestone}
              disabled={milestones.length >= 20 || createState.isLoading}
              className="rounded-lg border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
            >
              + Add Milestone
            </button>
          </div>

          {fieldErrors['milestones'] && (
            <p className="mt-2 text-xs text-red-600">{fieldErrors['milestones']}</p>
          )}

          <div className="mt-4 space-y-5">
            {milestones.map((milestone, index) => (
              <div
                key={index}
                className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Milestone {index + 1}</span>
                  {milestones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMilestone(index)}
                      disabled={createState.isLoading}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-medium text-gray-600">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={milestone.title}
                    onChange={(e) => updateMilestone(index, 'title', e.target.value)}
                    placeholder="e.g. Design mockups"
                    className="mt-0.5 block w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    disabled={createState.isLoading}
                  />
                  {fieldErrors[`milestones.${index}.title`] && (
                    <p className="mt-0.5 text-xs text-red-600">
                      {fieldErrors[`milestones.${index}.title`]}
                    </p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="block text-xs font-medium text-gray-600">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={milestone.description}
                    onChange={(e) => updateMilestone(index, 'description', e.target.value)}
                    rows={2}
                    placeholder="Describe the deliverable in detail..."
                    className="mt-0.5 block w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    disabled={createState.isLoading}
                  />
                  {fieldErrors[`milestones.${index}.description`] && (
                    <p className="mt-0.5 text-xs text-red-600">
                      {fieldErrors[`milestones.${index}.description`]}
                    </p>
                  )}
                </div>

                {/* Acceptance criteria */}
                <div>
                  <label className="block text-xs font-medium text-gray-600">
                    Acceptance Criteria <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={milestone.acceptanceCriteria}
                    onChange={(e) => updateMilestone(index, 'acceptanceCriteria', e.target.value)}
                    rows={2}
                    placeholder="Specific, measurable criteria for approval..."
                    className="mt-0.5 block w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    disabled={createState.isLoading}
                  />
                  {fieldErrors[`milestones.${index}.acceptanceCriteria`] && (
                    <p className="mt-0.5 text-xs text-red-600">
                      {fieldErrors[`milestones.${index}.acceptanceCriteria`]}
                    </p>
                  )}
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs font-medium text-gray-600">
                    Amount (USDC/USDT) <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-0.5 flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={milestone.amount}
                      onChange={(e) => updateMilestone(index, 'amount', e.target.value)}
                      placeholder="500.00"
                      className="block w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      disabled={createState.isLoading}
                    />
                    <span className="text-sm text-gray-400">USDC/T</span>
                  </div>
                  {fieldErrors[`milestones.${index}.amount`] && (
                    <p className="mt-0.5 text-xs text-red-600">
                      {fieldErrors[`milestones.${index}.amount`]}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Error and submit */}
        <ErrorAlert message={createState.error} />

        <button
          type="submit"
          disabled={createState.isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {createState.isLoading && <LoadingSpinner size="sm" />}
          {createState.isLoading ? 'Creating Deal...' : 'Create Deal'}
        </button>
      </form>
    </div>
  );
}
