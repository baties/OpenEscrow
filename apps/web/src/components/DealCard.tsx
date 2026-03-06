/**
 * DealCard.tsx — OpenEscrow Web Dashboard
 *
 * Card component for displaying a deal summary in the deals list.
 * Handles: rendering deal title (freelancer/client address), status badge,
 *          total amount, and a link to the deal detail page.
 * Does NOT: fetch data, manage state, or handle user interactions beyond navigation.
 */

import Link from 'next/link';
import type { Deal } from '@open-escrow/shared';
import { StatusBadge } from './StatusBadge';
import { formatTokenAmount, truncateAddress, formatDate } from '@/lib/format';

/**
 * Props for the DealCard component.
 */
interface DealCardProps {
  /** The deal object to display */
  deal: Deal;
  /** The wallet address of the currently authenticated user (for role display) */
  currentUserAddress: string;
}

/**
 * Renders a summary card for a single deal linking to its detail page.
 * Shows the counterparty address, status badge, total amount, and creation date.
 *
 * @param props - The deal object and current user's wallet address
 * @returns A card element linking to /deals/[id]
 */
export function DealCard({ deal, currentUserAddress }: DealCardProps) {
  const isClient = deal.clientId.toLowerCase() === currentUserAddress.toLowerCase();
  const counterparty = isClient ? deal.freelancerId : deal.clientId;
  const role = isClient ? 'Client' : 'Freelancer';

  return (
    <Link
      href={`/deals/${deal.id}`}
      className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{role}</p>
          <p className="mt-0.5 truncate font-medium text-gray-900">
            {role === 'Client' ? 'To: ' : 'From: '}
            <span className="font-mono text-sm">{truncateAddress(counterparty)}</span>
          </p>
        </div>
        <StatusBadge status={deal.status} className="shrink-0" />
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
        <span>
          <span className="font-semibold text-gray-900">
            {formatTokenAmount(deal.totalAmount)} USDC/T
          </span>{' '}
          across {deal.milestones?.length ?? 0} milestone{(deal.milestones?.length ?? 0) !== 1 ? 's' : ''}
        </span>
        <span className="text-xs text-gray-400">{formatDate(deal.createdAt)}</span>
      </div>
    </Link>
  );
}
