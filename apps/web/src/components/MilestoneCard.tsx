/**
 * MilestoneCard.tsx — OpenEscrow Web Dashboard
 *
 * Component for displaying a single milestone within a deal detail page.
 * Handles: rendering milestone info, status, and action buttons based on role.
 *          Client sees approve/reject buttons on SUBMITTED milestones.
 *          Freelancer sees a submit button on PENDING/REVISION milestones.
 * Does NOT: manage form state for submit/reject (that's handled by parent pages),
 *            make API calls directly, or manage auth state.
 */

import type { Milestone } from '@open-escrow/shared';
import { StatusBadge } from './StatusBadge';
import { formatTokenAmount } from '@/lib/format';

/**
 * Props for the MilestoneCard component.
 */
interface MilestoneCardProps {
  /** The milestone to display */
  milestone: Milestone;
  /** Whether the current user is the client (true) or freelancer (false) */
  isClient: boolean;
  /** Deal status — used to determine whether actions are available */
  dealStatus: string;
  /** Called when the client clicks Approve */
  onApprove?: (milestoneId: string) => void;
  /** Called when the client clicks Reject */
  onReject?: (milestoneId: string) => void;
  /** Called when the freelancer clicks Submit */
  onSubmit?: (milestoneId: string) => void;
  /** True while an action for this milestone is in progress */
  isActionsLoading?: boolean;
}

/**
 * Renders a single milestone card with role-aware action buttons.
 * Actions are only shown when the deal is in a state where they are valid.
 *
 * @param props - Milestone, role, deal status, and action callbacks
 * @returns A milestone card element
 */
export function MilestoneCard({
  milestone,
  isClient,
  dealStatus,
  onApprove,
  onReject,
  onSubmit,
  isActionsLoading = false,
}: MilestoneCardProps) {
  const canFreelancerSubmit =
    !isClient &&
    dealStatus === 'FUNDED' &&
    (milestone.status === 'PENDING' || milestone.status === 'REVISION');

  const canClientApproveOrReject =
    isClient && dealStatus === 'FUNDED' && milestone.status === 'SUBMITTED';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
              {milestone.sequence}
            </span>
            <h3 className="truncate font-medium text-gray-900">{milestone.title}</h3>
          </div>
          <p className="mt-1 text-sm text-gray-600 line-clamp-2">{milestone.description}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={milestone.status} />
          <span className="text-sm font-semibold text-gray-900">
            {formatTokenAmount(milestone.amount)} USDC/T
          </span>
        </div>
      </div>

      {/* Acceptance criteria */}
      <div className="mt-3 rounded-md bg-gray-50 p-3 text-sm text-gray-600">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
          Acceptance Criteria
        </p>
        <p>{milestone.acceptanceCriteria}</p>
      </div>

      {/* Action buttons */}
      {(canFreelancerSubmit || canClientApproveOrReject) && (
        <div className="mt-3 flex gap-2">
          {canFreelancerSubmit && onSubmit && (
            <button
              type="button"
              disabled={isActionsLoading}
              onClick={() => onSubmit(milestone.id)}
              className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {milestone.status === 'REVISION' ? 'Resubmit' : 'Submit Work'}
            </button>
          )}
          {canClientApproveOrReject && (
            <>
              {onApprove && (
                <button
                  type="button"
                  disabled={isActionsLoading}
                  onClick={() => onApprove(milestone.id)}
                  className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Approve
                </button>
              )}
              {onReject && (
                <button
                  type="button"
                  disabled={isActionsLoading}
                  onClick={() => onReject(milestone.id)}
                  className="flex-1 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reject
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
