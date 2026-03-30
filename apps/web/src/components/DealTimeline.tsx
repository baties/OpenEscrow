/**
 * DealTimeline.tsx — OpenEscrow Web Dashboard
 *
 * Component for rendering the deal event audit trail as a vertical timeline.
 * Handles: displaying deal_events in chronological order with icons and labels.
 * Does NOT: fetch events (caller provides them), manage state, or make API calls.
 */

import type { DealEvent } from '@open-escrow/shared';
import { formatDate, truncateAddress } from '@/lib/format';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorAlert } from './ErrorAlert';

/**
 * Maps event types to display labels.
 */
const EVENT_LABELS: Record<string, string> = {
  DEAL_CREATED: 'Deal created',
  DEAL_AGREED: 'Deal agreed by freelancer',
  DEAL_FUNDED: 'Deal funded on-chain',
  DEAL_CANCELLED: 'Deal cancelled',
  DEAL_COMPLETED: 'Deal completed',
  MILESTONE_SUBMITTED: 'Milestone submitted',
  MILESTONE_APPROVED: 'Milestone approved',
  MILESTONE_REJECTED: 'Milestone rejected',
  MILESTONE_REVISION: 'Milestone sent for revision',
};

/**
 * Maps event types to Tailwind icon background/color classes.
 */
const EVENT_ICON_CLASSES: Record<string, string> = {
  DEAL_CREATED: 'bg-gray-100 text-gray-500',
  DEAL_AGREED: 'bg-blue-100 text-blue-600',
  DEAL_FUNDED: 'bg-indigo-100 text-indigo-600',
  DEAL_CANCELLED: 'bg-red-100 text-red-600',
  DEAL_COMPLETED: 'bg-emerald-100 text-emerald-600',
  MILESTONE_SUBMITTED: 'bg-yellow-100 text-yellow-600',
  MILESTONE_APPROVED: 'bg-green-100 text-green-600',
  MILESTONE_REJECTED: 'bg-red-100 text-red-600',
  MILESTONE_REVISION: 'bg-orange-100 text-orange-600',
};

/**
 * Props for the DealTimeline component.
 */
interface DealTimelineProps {
  /** Array of deal events to render, null while loading */
  events: DealEvent[] | null;
  /** True while events are being fetched */
  isLoading: boolean;
  /** Error message if the fetch failed */
  error: string | null;
  /** Internal UUID of the deal's client — used to label actors in the timeline */
  clientId: string;
  /** Internal UUID of the deal's freelancer — used to label actors in the timeline */
  freelancerId: string;
  /** Wallet address of the client — shown alongside the role label */
  clientAddress: string;
  /** Wallet address of the freelancer — shown alongside the role label */
  freelancerAddress: string;
}

/**
 * Resolves an event's actorId to a human-readable label using the deal's participant IDs.
 * Returns "Client (0xABCD…1234)", "Freelancer (0xABCD…1234)", or "System" for auto events.
 *
 * @param actorId - Internal user UUID from the event record
 * @param clientId - Internal UUID of the deal's client
 * @param freelancerId - Internal UUID of the deal's freelancer
 * @param clientAddress - Wallet address of the client
 * @param freelancerAddress - Wallet address of the freelancer
 * @returns Human-readable actor label
 */
function resolveActor(
  actorId: string | null,
  clientId: string,
  freelancerId: string,
  clientAddress: string,
  freelancerAddress: string
): string {
  if (!actorId) return 'System';
  if (actorId === clientId) return `Client (${truncateAddress(clientAddress)})`;
  if (actorId === freelancerId) return `Freelancer (${truncateAddress(freelancerAddress)})`;
  return 'System';
}

/**
 * Renders the deal audit trail as a vertical timeline.
 * Shows a spinner while loading and an error alert on failure.
 *
 * @param props - Events array, loading state, error message, and deal participant context
 * @returns A timeline element or appropriate loading/error state
 */
export function DealTimeline({
  events,
  isLoading,
  error,
  clientId,
  freelancerId,
  clientAddress,
  freelancerAddress,
}: DealTimelineProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner label="Loading timeline..." />
      </div>
    );
  }

  if (error) {
    return <ErrorAlert message={error} className="my-4" />;
  }

  if (!events || events.length === 0) {
    return <p className="py-4 text-center text-sm text-gray-500">No events recorded yet.</p>;
  }

  return (
    <ol className="relative border-l border-gray-200 pl-6">
      {events.map((event, index) => {
        const iconClasses = EVENT_ICON_CLASSES[event.eventType] ?? 'bg-gray-100 text-gray-500';
        const label = EVENT_LABELS[event.eventType] ?? event.eventType;

        return (
          <li key={event.id} className={`mb-6 ${index === events.length - 1 ? '' : ''}`}>
            {/* Timeline dot */}
            <span
              className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${iconClasses}`}
              aria-hidden="true"
            >
              <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                <circle cx="10" cy="10" r="4" />
              </svg>
            </span>

            <div>
              <p className="text-sm font-medium text-gray-900">{label}</p>
              <time dateTime={event.createdAt} className="block text-xs text-gray-400">
                {formatDate(event.createdAt)}
              </time>
              <p className="mt-0.5 text-xs text-gray-500">
                by{' '}
                <span className="font-mono">
                  {resolveActor(
                    event.actorId,
                    clientId,
                    freelancerId,
                    clientAddress,
                    freelancerAddress
                  )}
                </span>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
