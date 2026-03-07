/**
 * SubmitMilestoneModal.tsx — OpenEscrow Web Dashboard
 *
 * Modal dialog for freelancers to submit a milestone for review.
 * Handles: form state for summary and delivery links, Zod validation before submit.
 * Does NOT: perform the API call directly (delegates to onSubmit callback),
 *            manage deal or auth state.
 */

'use client';

import { useState } from 'react';
import { submitMilestoneSchema, type SubmitMilestoneFormValues } from '@/lib/schemas';
import { ErrorAlert } from './ErrorAlert';
import { LoadingSpinner } from './LoadingSpinner';

/**
 * Props for the SubmitMilestoneModal component.
 */
interface SubmitMilestoneModalProps {
  /** The milestone ID being submitted */
  milestoneId: string;
  /** The milestone title for display in the modal heading */
  milestoneTitle: string;
  /** Called when the form is valid and the user clicks Submit */
  onSubmit: (milestoneId: string, values: SubmitMilestoneFormValues) => Promise<void>;
  /** Called when the user dismisses the modal */
  onClose: () => void;
  /** True while the submit action is in progress */
  isLoading: boolean;
}

/**
 * Renders a modal for submitting a milestone deliverable.
 * Validates summary and links with Zod before calling onSubmit.
 *
 * @param props - milestoneId, title, submit callback, close callback, loading state
 * @returns A modal dialog element
 */
export function SubmitMilestoneModal({
  milestoneId,
  milestoneTitle,
  onSubmit,
  onClose,
  isLoading,
}: SubmitMilestoneModalProps) {
  const [summary, setSummary] = useState('');
  const [linksInput, setLinksInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * Handles form submission: validates with Zod, then calls the onSubmit callback.
   */
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setSubmitError(null);

    // Parse links: one URL per line, skip blank lines
    const links = linksInput
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const result = submitMilestoneSchema.safeParse({ summary, links });
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
      await onSubmit(milestoneId, result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Submission failed. Please try again.';
      setSubmitError(message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 id="submit-modal-title" className="text-lg font-semibold text-gray-900">
          Submit Milestone
        </h2>
        <p className="mt-1 text-sm text-gray-500">{milestoneTitle}</p>

        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="mt-4 space-y-4"
        >
          {/* Summary */}
          <div>
            <label htmlFor="summary" className="block text-sm font-medium text-gray-700">
              Summary <span className="text-red-500">*</span>
            </label>
            <textarea
              id="summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={4}
              placeholder="Describe what you built/delivered and how it meets the acceptance criteria..."
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              disabled={isLoading}
            />
            {errors['summary'] && <p className="mt-1 text-xs text-red-600">{errors['summary']}</p>}
          </div>

          {/* Links */}
          <div>
            <label htmlFor="links" className="block text-sm font-medium text-gray-700">
              Delivery Links <span className="text-gray-400">(optional, one per line)</span>
            </label>
            <textarea
              id="links"
              value={linksInput}
              onChange={(e) => setLinksInput(e.target.value)}
              rows={3}
              placeholder="https://github.com/your-repo&#10;https://staging.example.com"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm placeholder-gray-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              disabled={isLoading}
            />
            {errors['links'] && <p className="mt-1 text-xs text-red-600">{errors['links']}</p>}
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
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading && <LoadingSpinner size="sm" />}
              Submit Work
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
