/**
 * StatusBadge.tsx — OpenEscrow Web Dashboard
 *
 * Reusable pill badge component for deal and milestone status display.
 * Handles: rendering a color-coded badge for a given status string.
 * Does NOT: manage any state, make API calls, or handle user interactions.
 */

import { formatStatus, getStatusBadgeClasses } from '@/lib/format';

/**
 * Props for the StatusBadge component.
 */
interface StatusBadgeProps {
  /** The status string to display, e.g. "DRAFT", "FUNDED", "APPROVED" */
  status: string;
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * Renders a color-coded pill badge for a deal or milestone status.
 *
 * @param props - Status string and optional extra classes
 * @returns A styled span element showing the human-readable status label
 */
export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const colorClasses = getStatusBadgeClasses(status);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colorClasses} ${className}`}
    >
      {formatStatus(status)}
    </span>
  );
}
