/**
 * RejectMilestoneModal.tsx — OpenEscrow Web Dashboard
 *
 * Modal dialog for clients to reject a milestone with structured reasons.
 * Handles: form state for reason codes and free-text feedback, Zod validation.
 * Does NOT: perform the API call directly (delegates to onReject callback),
 *            manage deal or auth state.
 */

'use client';

import { useState } from 'react';
import {
  rejectMilestoneSchema,
  REJECTION_REASON_CODES,
  type RejectMilestoneFormValues,
  type RejectionReasonCode,
} from '@/lib/schemas';
import { ErrorAlert } from './ErrorAlert';
import { LoadingSpinner } from './LoadingSpinner';

/** Human-readable labels for rejection reason codes */
const REASON_LABELS: Record<RejectionReasonCode, string> = {
  INCOMPLETE_DELIVERABLE: 'Incomplete deliverable',
  DOESNT_MATCH_CRITERIA: 'Does not match acceptance criteria',
  BUG_OR_ERROR: 'Contains bugs or errors',
  POOR_QUALITY: 'Quality below expectations',
  MISSING_DOCUMENTATION: 'Missing documentation',
  OTHER: 'Other',
};

/**
 * Props for the RejectMilestoneModal component.
 */
interface RejectMilestoneModalProps {
  /** The milestone ID being rejected */
  milestoneId: string;
  /** The milestone title for display in the modal heading */
  milestoneTitle: string;
  /** Called when the form is valid and the user clicks Reject */
  onReject: (milestoneId: string, values: RejectMilestoneFormValues) => Promise<void>;
  /** Called when the user dismisses the modal */
  onClose: () => void;
  /** True while the reject action is in progress */
  isLoading: boolean;
}

/**
 * Renders a modal for rejecting a submitted milestone with structured reasons.
 * Validates reason codes and free text with Zod before calling onReject.
 *
 * @param props - milestoneId, title, reject callback, close callback, loading state
 * @returns A modal dialog element
 */
export function RejectMilestoneModal({
  milestoneId,
  milestoneTitle,
  onReject,
  onClose,
  isLoading,
}: RejectMilestoneModalProps) {
  const [selectedReasons, setSelectedReasons] = useState<RejectionReasonCode[]>([]);
  const [freeText, setFreeText] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * Toggles a reason code in the selected list.
   *
   * @param code - The reason code to toggle
   */
  function toggleReason(code: RejectionReasonCode) {
    setSelectedReasons((prev) =>
      prev.includes(code) ? prev.filter((r) => r !== code) : [...prev, code]
    );
  }

  /**
   * Handles form submission: validates with Zod, then calls the onReject callback.
   */
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setSubmitError(null);

    const result = rejectMilestoneSchema.safeParse({
      reasonCodes: selectedReasons,
      freeText,
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0]?.toString() ?? 'root';
        fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    try {
      await onReject(milestoneId, result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rejection failed. Please try again.';
      setSubmitError(message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 id="reject-modal-title" className="text-lg font-semibold text-gray-900">
          Reject Milestone
        </h2>
        <p className="mt-1 text-sm text-gray-500">{milestoneTitle}</p>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="mt-4 space-y-4"
        >
          {/* Reason codes */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-700">
              Rejection Reasons <span className="text-red-500">*</span>
            </legend>
            <div className="mt-2 space-y-2">
              {REJECTION_REASON_CODES.map((code) => (
                <label key={code} className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={selectedReasons.includes(code)}
                    onChange={() => toggleReason(code)}
                    disabled={isLoading}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">{REASON_LABELS[code]}</span>
                </label>
              ))}
            </div>
            {errors['reasonCodes'] && (
              <p className="mt-1 text-xs text-red-600">{errors['reasonCodes']}</p>
            )}
          </fieldset>

          {/* Free-text feedback */}
          <div>
            <label htmlFor="freeText" className="block text-sm font-medium text-gray-700">
              Additional Feedback <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              id="freeText"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={3}
              placeholder="Describe specifically what needs to be fixed or improved..."
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              disabled={isLoading}
            />
            {errors['freeText'] && (
              <p className="mt-1 text-xs text-red-600">{errors['freeText']}</p>
            )}
          </div>

          <ErrorAlert message={submitError} onDismiss={() => setSubmitError(null)} />

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading && <LoadingSpinner size="sm" />}
              Reject Milestone
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
