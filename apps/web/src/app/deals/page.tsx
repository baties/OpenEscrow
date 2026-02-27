/**
 * deals/page.tsx — OpenEscrow Web Dashboard
 *
 * My Deals list page — shows all deals for the authenticated user.
 * Handles: fetching deals via useDeals hook, rendering DealCard grid,
 *          redirecting unauthenticated users to home.
 * Does NOT: create deals (see deals/new/page.tsx), manage auth state,
 *            or make API calls directly.
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useDeals } from '@/hooks/use-deals';
import { DealCard } from '@/components/DealCard';
import { ErrorAlert } from '@/components/ErrorAlert';
import { LoadingSpinner } from '@/components/LoadingSpinner';

/**
 * Deals list page component.
 * Redirects unauthenticated users to the home page.
 *
 * @returns Deals list page JSX
 */
export default function DealsPage() {
  const router = useRouter();
  const { isAuthenticated, walletAddress } = useAuth();
  const { deals, isLoading, error, refresh } = useDeals();

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated || !walletAddress) {
    return null; // Will redirect
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Deals</h1>
          <p className="mt-1 text-sm text-gray-500">
            All deals where you are the client or freelancer
          </p>
        </div>
        <Link
          href="/deals/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          + New Deal
        </Link>
      </div>

      {/* Error state */}
      <ErrorAlert
        message={error}
        onDismiss={refresh}
      />

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="lg" label="Loading your deals..." />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && deals !== null && deals.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <p className="text-gray-500">No deals yet.</p>
          <p className="mt-2 text-sm text-gray-400">
            Create a new deal as a client, or ask a client to add your wallet as freelancer.
          </p>
          <Link
            href="/deals/new"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Create Your First Deal
          </Link>
        </div>
      )}

      {/* Deals grid */}
      {!isLoading && deals !== null && deals.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              currentUserAddress={walletAddress}
            />
          ))}
        </div>
      )}
    </div>
  );
}
