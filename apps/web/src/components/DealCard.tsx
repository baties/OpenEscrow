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
import { PartyRow } from './PartyRow';
import { formatTokenAmount, formatDate } from '@/lib/format';
import { config as appConfig } from '@/lib/config';

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
  const isClient = deal.clientAddress.toLowerCase() === currentUserAddress.toLowerCase();
  const role = isClient ? 'Client' : 'Freelancer';
  const shortId = deal.id.slice(0, 8);
  const explorerBase = appConfig.chainMeta.explorerUrl;

  const myId = isClient ? deal.clientId : deal.freelancerId;
  const myAddress = isClient ? deal.clientAddress : deal.freelancerAddress;
  const counterpartyId = isClient ? deal.freelancerId : deal.clientId;
  const counterpartyAddress = isClient ? deal.freelancerAddress : deal.clientAddress;
  const counterpartyLabel = isClient ? 'Freelancer ID' : 'Client ID';
  const counterpartyAddressLabel = isClient ? 'To Address' : 'From Address';

  return (
    <Link
      href={`/deals/${deal.id}`}
      className="block rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{role}</p>
            <p className="font-mono text-xs text-gray-300" title={deal.id}>
              #{shortId}…
            </p>
          </div>
        </div>
        <StatusBadge status={deal.status} className="shrink-0" />
      </div>

      <div className="mt-2 space-y-1">
        <PartyRow label="Your ID" value={myId} action="copy" />
        <PartyRow
          label="Your Address"
          value={myAddress}
          action="explorer"
          explorerUrl={`${explorerBase}/address/${myAddress}`}
        />
        <PartyRow label={counterpartyLabel} value={counterpartyId} action="copy" />
        <PartyRow
          label={counterpartyAddressLabel}
          value={counterpartyAddress}
          action="explorer"
          explorerUrl={`${explorerBase}/address/${counterpartyAddress}`}
        />
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
        <span>
          <span className="font-semibold text-gray-900">
            {formatTokenAmount(deal.totalAmount)} USDC/T
          </span>{' '}
          across {deal.milestones?.length ?? 0} milestone
          {(deal.milestones?.length ?? 0) !== 1 ? 's' : ''}
        </span>
        <span className="text-xs text-gray-400">{formatDate(deal.createdAt)}</span>
      </div>
    </Link>
  );
}
