/**
 * deals/accept/[id]/page.tsx — OpenEscrow Web Dashboard
 *
 * Public invitation landing page for shareable deal links.
 * Handles: displaying a deal invitation to an unauthenticated freelancer,
 *          storing the post-auth redirect in sessionStorage so the user lands
 *          on the correct deal page after signing in.
 * Does NOT: fetch any deal data (requires auth — kept public intentionally),
 *            modify auth state, or perform any API calls.
 *
 * Flow:
 *   1. Client copies share link from deal detail page → /deals/accept/<dealId>
 *   2. Freelancer opens the link (possibly not signed in)
 *   3. If authenticated: redirected immediately to /deals/<dealId>
 *   4. If not authenticated: this page stores /deals/<dealId> in sessionStorage,
 *      then links to the home page where the wallet connect flow lives.
 *      After sign-in, the home page reads sessionStorage and redirects to the deal.
 */

'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { LoadingSpinner } from '@/components/LoadingSpinner';

/** SessionStorage key used to persist the post-auth redirect destination. */
const POST_AUTH_REDIRECT_KEY = 'openescrow_post_auth_redirect';

/**
 * Deal invitation landing page.
 * Shown when a freelancer opens a share link from the client.
 *
 * @returns Invitation page JSX
 */
export default function DealAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const dealId = typeof params['id'] === 'string' ? params['id'] : null;
  const { isAuthenticated } = useAuth();

  const dealPath = dealId ? `/deals/${dealId}` : '/deals';

  // If already authenticated, redirect straight to the deal
  useEffect(() => {
    if (isAuthenticated && dealId) {
      router.replace(dealPath);
    }
  }, [isAuthenticated, dealId, dealPath, router]);

  /**
   * Stores the deal path in sessionStorage so the home page can redirect
   * the user to the correct deal after they complete the SIWE sign-in flow.
   */
  function storeRedirectAndGoHome() {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, dealPath);
    }
    router.push('/');
  }

  if (isAuthenticated) {
    // Redirect is in progress — show a brief spinner
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="lg" label="Redirecting to deal…" />
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      {/* Invitation card */}
      <div className="mx-auto max-w-md rounded-2xl border border-indigo-100 bg-white p-8 shadow-sm">
        {/* Icon */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50">
          <span className="text-3xl" aria-hidden="true">
            🔐
          </span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900">You&apos;ve been invited</h1>
        <p className="mt-2 text-gray-500">
          A client has shared an escrow deal with you on OpenEscrow.
        </p>

        {dealId && (
          <p className="mt-4 rounded-lg bg-gray-50 px-4 py-2 font-mono text-sm text-gray-500">
            Deal <span className="text-gray-700">#{dealId.slice(0, 8)}…</span>
          </p>
        )}

        <p className="mt-4 text-sm text-gray-500">
          Connect your wallet to review the milestones, acceptance criteria, and agree to the deal.
        </p>

        {/* Primary action */}
        <button
          type="button"
          onClick={storeRedirectAndGoHome}
          className="mt-6 w-full rounded-xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          Sign in to view deal
        </button>

        <p className="mt-3 text-xs text-gray-400">Sign-In With Ethereum — no gas fee required</p>

        {/* Secondary: go directly to home without redirect */}
        <Link href="/" className="mt-4 block text-xs text-gray-400 underline hover:text-gray-600">
          Just sign in (no redirect)
        </Link>
      </div>

      {/* What is OpenEscrow blurb */}
      <div className="mt-8 max-w-sm text-center">
        <p className="text-xs text-gray-400">
          OpenEscrow is an open-source milestone-based escrow platform. Funds are locked in a smart
          contract and released only when milestones are approved.
        </p>
      </div>
    </div>
  );
}
