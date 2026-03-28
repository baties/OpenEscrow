/**
 * deals/page.tsx — OpenEscrow Web Dashboard
 *
 * My Deals list page — shows all deals for the authenticated user.
 * Handles: fetching deals via useDeals hook, rendering DealCard grid,
 *          showing a Telegram CTA banner when the account is not linked,
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
import { useTelegramStatus } from '@/hooks/use-telegram-status';
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
  const { linked: telegramLinked, isLoading: telegramLoading } = useTelegramStatus(isAuthenticated);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated, router]);

  // Auto-refresh the deals list whenever any deal updates.
  // NotificationProvider dispatches 'deal:updated' on status change.
  useEffect(() => {
    function handleDealUpdated() {
      refresh();
    }
    window.addEventListener('deal:updated', handleDealUpdated);
    return () => window.removeEventListener('deal:updated', handleDealUpdated);
  }, [refresh]);

  if (!isAuthenticated || !walletAddress) {
    return null; // Will redirect
  }

  // Show the Telegram CTA only once we know the status (not while loading)
  const showTelegramCta = !telegramLoading && telegramLinked === false;

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

      {/* Telegram CTA banner — shown when account is not linked to Telegram */}
      {showTelegramCta && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden="true">
              📱
            </span>
            <div className="flex-1">
              <h2 className="font-semibold text-indigo-900">Get deal notifications on Telegram</h2>
              <p className="mt-1 text-sm text-indigo-700">
                Connect your Telegram account to receive instant alerts when your deal is funded, a
                milestone is approved or rejected, or the other party takes action.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/deals/new"
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
                >
                  Create Your First Deal
                </Link>
                <Link
                  href="/settings/telegram"
                  className="rounded-lg border border-indigo-300 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-colors hover:bg-indigo-50"
                >
                  Connect Telegram Bot
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      <ErrorAlert message={error} onDismiss={refresh} />

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <LoadingSpinner size="lg" label="Loading your deals..." />
        </div>
      )}

      {/* Empty state — only shown without the CTA banner (Telegram already linked) */}
      {!isLoading && !error && deals !== null && deals.length === 0 && !showTelegramCta && (
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
            <DealCard key={deal.id} deal={deal} currentUserAddress={walletAddress} />
          ))}
        </div>
      )}
    </div>
  );
}
