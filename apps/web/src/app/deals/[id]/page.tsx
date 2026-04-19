/**
 * deals/[id]/page.tsx — OpenEscrow Web Dashboard
 *
 * Deal detail page — shows deal info, milestones, role-aware actions, timeline, and chat.
 * Handles: fetching deal + timeline, role detection (client vs freelancer),
 *          approve/reject/submit/agree/cancel actions via hooks,
 *          modal state for submit and reject flows.
 * Does NOT: interact with the blockchain directly (fund flow is in deals/[id]/fund),
 *            manage auth state, call the API directly.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useDeal } from '@/hooks/use-deal';
import { useDealTimeline } from '@/hooks/use-deal-timeline';
import { useDealActions } from '@/hooks/use-deal-actions';
import { useMilestoneActions } from '@/hooks/use-milestone-actions';
import { MilestoneCard } from '@/components/MilestoneCard';
import { DealTimeline } from '@/components/DealTimeline';
import { StatusBadge } from '@/components/StatusBadge';
import { ErrorAlert } from '@/components/ErrorAlert';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { SubmitMilestoneModal } from '@/components/SubmitMilestoneModal';
import { RejectMilestoneModal } from '@/components/RejectMilestoneModal';
import { formatTokenAmount, truncateAddress, formatDate } from '@/lib/format';
import { CopyButton } from '@/components/CopyButton';
import { DealChat } from '@/components/DealChat';
import { config as appConfig } from '@/lib/config';
import type { SubmitMilestoneFormValues, RejectMilestoneFormValues } from '@/lib/schemas';

/**
 * Deal detail page component.
 * Shows role-aware actions for client and freelancer.
 *
 * @returns Deal detail page JSX
 */
export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = typeof params['id'] === 'string' ? params['id'] : null;

  const { isAuthenticated, walletAddress } = useAuth();
  const {
    deal,
    isLoading: isDealLoading,
    error: dealError,
    refresh: refreshDeal,
  } = useDeal(dealId);
  const {
    events,
    isLoading: isTimelineLoading,
    error: timelineError,
    refresh: refreshTimeline,
  } = useDealTimeline(dealId);
  const { agreeDeal, cancelDeal, agreeState, cancelState } = useDealActions();
  const {
    submitMilestone,
    approveMilestone,
    rejectMilestone,
    submitState,
    approveState,
    rejectState,
  } = useMilestoneActions();

  // Modal state
  const [submitModalMilestoneId, setSubmitModalMilestoneId] = useState<string | null>(null);
  const [rejectModalMilestoneId, setRejectModalMilestoneId] = useState<string | null>(null);
  // Success banner shown after agree/cancel actions
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Copy-share-link transient feedback
  const [shareLinkCopied, setShareLinkCopied] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  // Auto-refresh when the NotificationProvider detects a change for this deal.
  // NotificationProvider dispatches 'deal:updated' with { dealId } whenever it
  // detects a status change during its 30s poll cycle.
  useEffect(() => {
    if (!dealId) return;

    function handleDealUpdated(e: Event) {
      const evt = e as CustomEvent<{ dealId: string }>;
      if (evt.detail?.dealId === dealId) {
        refreshDeal();
        refreshTimeline();
      }
    }

    window.addEventListener('deal:updated', handleDealUpdated);
    return () => window.removeEventListener('deal:updated', handleDealUpdated);
  }, [dealId, refreshDeal, refreshTimeline]);

  /**
   * Copies the deal's shareable accept URL to the clipboard.
   * The URL points to /deals/accept/[id] — a public landing page for
   * the freelancer to sign in and accept the deal.
   *
   * @returns void
   */
  const handleCopyShareLink = useCallback(async () => {
    const url = `${window.location.origin}/deals/accept/${deal?.id ?? ''}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareLinkCopied(true);
      setTimeout(() => setShareLinkCopied(false), 1500);
    } catch {
      console.warn('[DealDetailPage] Clipboard write failed');
    }
  }, [deal?.id]);

  if (!isAuthenticated || !walletAddress) return null;

  // Only show full-page spinner on first load (deal is null).
  // During refresh the existing deal is kept visible so the page doesn't flash.
  if (isDealLoading && !deal) {
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
  const isFreelancer = deal.freelancerAddress.toLowerCase() === walletAddress.toLowerCase();

  // Determine available deal-level actions.
  const canAgree = isFreelancer && deal.status === 'DRAFT';
  // Freelancer declining a DRAFT deal = cancel before funding (no refund needed).
  const canDecline = isFreelancer && deal.status === 'DRAFT';
  const canFund = isClient && deal.status === 'AGREED';
  // Client can cancel in DRAFT, AGREED, or FUNDED.
  // Freelancer can only cancel in AGREED (before client funds) — DRAFT is handled by "Decline".
  // After FUNDED, only the client can cancel.
  const canCancel =
    (isClient && ['DRAFT', 'AGREED', 'FUNDED'].includes(deal.status)) ||
    (isFreelancer && deal.status === 'AGREED');

  const isMilestoneActionsLoading =
    submitState.isLoading || approveState.isLoading || rejectState.isLoading;

  // Find the milestone for the open modals
  const submitMilestone_ = deal.milestones.find((m) => m.id === submitModalMilestoneId);
  const rejectMilestone_ = deal.milestones.find((m) => m.id === rejectModalMilestoneId);

  /**
   * Handles freelancer agreeing to the deal.
   * Shows a success banner immediately and refreshes deal state in the background.
   */
  async function handleAgree() {
    setSuccessMessage(null);
    const updated = await agreeDeal(deal!.id);
    if (updated) {
      setSuccessMessage('Deal agreed! The client can now fund the deal.');
      refreshDeal();
      refreshTimeline();
    }
  }

  /**
   * Handles cancelling (or declining) the deal.
   * Shows a success banner after cancellation and refreshes deal state.
   */
  async function handleCancel() {
    const isDraft = deal!.status === 'DRAFT';
    const actionLabel = isDraft && isFreelancer ? 'decline' : 'cancel';
    if (
      !window.confirm(`Are you sure you want to ${actionLabel} this deal? This cannot be undone.`)
    ) {
      return;
    }
    setSuccessMessage(null);
    const updated = await cancelDeal(deal!.id);
    if (updated) {
      setSuccessMessage(isDraft && isFreelancer ? 'Deal declined.' : 'Deal cancelled.');
      refreshDeal();
      refreshTimeline();
    }
  }

  /**
   * Handles milestone approval by the client.
   *
   * @param milestoneId - The milestone to approve
   */
  async function handleApprove(milestoneId: string) {
    const updated = await approveMilestone(milestoneId);
    if (updated) {
      refreshDeal();
      refreshTimeline();
    }
  }

  /**
   * Handles milestone submission by the freelancer.
   *
   * @param milestoneId - The milestone being submitted
   * @param values - Validated form values
   */
  async function handleSubmitMilestone(
    milestoneId: string,
    values: SubmitMilestoneFormValues
  ): Promise<void> {
    const result = await submitMilestone(milestoneId, values);
    if (result) {
      setSubmitModalMilestoneId(null);
      refreshDeal();
      refreshTimeline();
    }
  }

  /**
   * Handles milestone rejection by the client.
   *
   * @param milestoneId - The milestone being rejected
   * @param values - Validated form values with reason codes
   */
  async function handleRejectMilestone(
    milestoneId: string,
    values: RejectMilestoneFormValues
  ): Promise<void> {
    const result = await rejectMilestone(milestoneId, values);
    if (result) {
      setRejectModalMilestoneId(null);
      refreshDeal();
      refreshTimeline();
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/deals" className="inline-block text-sm text-indigo-600 hover:underline">
        ← Back to My Deals
      </Link>

      {/* Success banner */}
      {successMessage && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="ml-4 text-emerald-600 hover:text-emerald-800"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Deal header */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge status={deal.status} />
              <CopyButton text={deal.id} variant="icon" className="text-gray-300" />
              <span className="text-xs text-gray-400 font-mono" title={deal.id}>
                #{deal.id.slice(0, 8)}
              </span>
              {/* Share link — client only, shown on DRAFT deals so client can invite freelancer */}
              {isClient && deal.status === 'DRAFT' && (
                <button
                  type="button"
                  onClick={() => void handleCopyShareLink()}
                  title={
                    shareLinkCopied ? 'Link copied!' : 'Copy shareable deal link for freelancer'
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-100"
                >
                  {shareLinkCopied ? (
                    <>
                      <svg
                        className="h-3 w-3 text-emerald-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Copied!
                    </>
                  ) : (
                    <>
                      <svg
                        className="h-3 w-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                        />
                      </svg>
                      Share Link
                    </>
                  )}
                </button>
              )}
            </div>
            {/* Grid: 1 col on mobile (stacked), 2 cols on sm+ */}
            <div className="mt-2 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 sm:gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  🧑‍💼 Client
                </p>
                {isClient ? (
                  /* Own section — show wallet address with explorer link */
                  <a
                    href={`${appConfig.chainMeta.explorerUrl}/address/${deal.clientAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`View ${deal.clientAddress} on ${appConfig.chainMeta.name} explorer`}
                    className="truncate font-mono text-gray-700 transition-colors hover:text-indigo-600 flex items-center gap-1"
                  >
                    {truncateAddress(deal.clientAddress)}
                    <svg
                      className="h-3 w-3 shrink-0"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
                        clipRule="evenodd"
                      />
                      <path
                        fillRule="evenodd"
                        d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </a>
                ) : (
                  /* Counterparty — show username only for privacy */
                  <p className="font-mono text-gray-700">
                    {deal.clientUsername ?? <span className="text-gray-400 italic">Anonymous</span>}
                  </p>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  🛠️ Freelancer
                </p>
                {isFreelancer ? (
                  /* Own section — show wallet address with explorer link */
                  <a
                    href={`${appConfig.chainMeta.explorerUrl}/address/${deal.freelancerAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`View ${deal.freelancerAddress} on ${appConfig.chainMeta.name} explorer`}
                    className="truncate font-mono text-gray-700 transition-colors hover:text-indigo-600 flex items-center gap-1"
                  >
                    {truncateAddress(deal.freelancerAddress)}
                    <svg
                      className="h-3 w-3 shrink-0"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
                        clipRule="evenodd"
                      />
                      <path
                        fillRule="evenodd"
                        d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </a>
                ) : (
                  /* Counterparty — show username only for privacy */
                  <p className="font-mono text-gray-700">
                    {deal.freelancerUsername ?? (
                      <span className="text-gray-400 italic">Anonymous</span>
                    )}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Total Amount
                </p>
                <p className="font-semibold text-gray-900">
                  {formatTokenAmount(deal.totalAmount)} USDC/T
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Created</p>
                <p className="text-gray-700">{formatDate(deal.createdAt)}</p>
              </div>
            </div>
          </div>

          {/* Deal-level actions */}
          <div className="flex shrink-0 flex-col gap-2">
            {canAgree && (
              <button
                type="button"
                disabled={agreeState.isLoading}
                onClick={() => {
                  void handleAgree();
                }}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
              >
                {agreeState.isLoading && <LoadingSpinner size="sm" />}
                Agree to Deal
              </button>
            )}
            {canDecline && (
              <button
                type="button"
                disabled={cancelState.isLoading}
                onClick={() => {
                  void handleCancel();
                }}
                className="flex items-center gap-1.5 rounded-lg border border-orange-200 px-4 py-2 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-50 disabled:opacity-60"
              >
                {cancelState.isLoading && <LoadingSpinner size="sm" />}
                Decline Deal
              </button>
            )}
            {canFund && (
              <Link
                href={`/deals/${deal.id}/fund`}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-emerald-700"
              >
                Fund Deal
              </Link>
            )}
            {canCancel && (
              <button
                type="button"
                disabled={cancelState.isLoading}
                onClick={() => {
                  void handleCancel();
                }}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
              >
                {cancelState.isLoading && <LoadingSpinner size="sm" />}
                Cancel Deal
              </button>
            )}
          </div>
        </div>

        {/* Action errors */}
        <ErrorAlert message={agreeState.error ?? cancelState.error} className="mt-3" />
        <ErrorAlert
          message={approveState.error ?? rejectState.error ?? submitState.error}
          className="mt-3"
        />
      </div>

      {/* Milestones */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Milestones ({deal.milestones.length})
        </h2>
        <div className="space-y-3">
          {deal.milestones
            .slice()
            .sort((a, b) => a.sequence - b.sequence)
            .map((milestone) => (
              <MilestoneCard
                key={milestone.id}
                milestone={milestone}
                isClient={isClient}
                dealStatus={deal.status}
                onSubmit={(mid) => setSubmitModalMilestoneId(mid)}
                onApprove={(mid) => {
                  void handleApprove(mid);
                }}
                onReject={(mid) => setRejectModalMilestoneId(mid)}
                isActionsLoading={isMilestoneActionsLoading}
              />
            ))}
        </div>
      </div>

      {/* Timeline */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Activity Timeline</h2>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <DealTimeline
            events={events}
            isLoading={isTimelineLoading}
            error={timelineError}
            clientId={deal.clientId}
            freelancerId={deal.freelancerId}
            clientUsername={deal.clientUsername}
            freelancerUsername={deal.freelancerUsername}
          />
        </div>
      </div>

      {/* Chat */}
      <DealChat dealId={deal.id} clientId={deal.clientId} />

      {/* Submit Milestone Modal */}
      {submitModalMilestoneId && submitMilestone_ && (
        <SubmitMilestoneModal
          milestoneId={submitModalMilestoneId}
          milestoneTitle={submitMilestone_.title}
          onSubmit={handleSubmitMilestone}
          onClose={() => setSubmitModalMilestoneId(null)}
          isLoading={submitState.isLoading}
        />
      )}

      {/* Reject Milestone Modal */}
      {rejectModalMilestoneId && rejectMilestone_ && (
        <RejectMilestoneModal
          milestoneId={rejectModalMilestoneId}
          milestoneTitle={rejectMilestone_.title}
          onReject={handleRejectMilestone}
          onClose={() => setRejectModalMilestoneId(null)}
          isLoading={rejectState.isLoading}
        />
      )}
    </div>
  );
}
