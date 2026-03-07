/**
 * page.tsx — OpenEscrow Web Dashboard (Home / Landing)
 *
 * Home page displayed to unauthenticated and authenticated users.
 * Handles: wallet connect prompt, auto-SIWE status display, redirect to /deals when authed.
 * Does NOT: fetch any data, manage auth state (reads via useAuth hook),
 *            or contain any business logic.
 *
 * Auth UX: user connects wallet once — SIWE is triggered automatically by AuthProvider.
 * If the user rejects the signature, an error + "Try again" button is shown.
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { useAuth } from '@/hooks/use-auth';
import { ErrorAlert } from '@/components/ErrorAlert';
import { LoadingSpinner } from '@/components/LoadingSpinner';

/**
 * Home page component.
 * Redirects authenticated users to /deals.
 * Shows wallet connect + SIWE sign-in flow for unauthenticated users.
 *
 * @returns Home page JSX
 */
export default function HomePage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { isAuthenticated, isSigningIn, signInError, signIn } = useAuth();

  // Redirect to deals list if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/deals');
    }
  }, [isAuthenticated, router]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      {/* Hero section */}
      <div className="mb-10 max-w-2xl">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          <span className="block">Milestone-based escrow</span>
          <span className="block mt-4 text-indigo-600">for Web3 projects</span>
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Lock USDC or USDT in a smart contract. Get paid on verified milestones.
          No disputes, no trust required — just on-chain accountability.
        </p>
      </div>

      {/* Feature highlights */}
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            icon: '🔐',
            title: 'Funds locked on-chain',
            desc: 'USDC/USDT secured in an audited Sepolia smart contract',
          },
          {
            icon: '📋',
            title: 'Milestone verification',
            desc: 'Client approves each milestone before funds are released',
          },
          {
            icon: '🔄',
            title: 'Revision loop',
            desc: 'Structured feedback and revision process — no guesswork',
          },
        ].map(({ icon, title, desc }) => (
          <div
            key={title}
            className="rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm"
          >
            <span className="text-2xl" aria-hidden="true">{icon}</span>
            <h3 className="mt-2 font-semibold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">{desc}</p>
          </div>
        ))}
      </div>

      {/* Auth flow */}
      <div className="flex flex-col items-center gap-4">
        {!isConnected ? (
          <>
            <p className="text-sm text-gray-500">Connect your wallet to get started</p>
            <ConnectButton label="Connect Wallet" />
          </>
        ) : isSigningIn ? (
          /* Auto-SIWE in progress — wallet signature request is open */
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner size="lg" />
            <p className="text-sm font-medium text-gray-700">Verifying wallet identity…</p>
            <p className="text-xs text-gray-400">
              Check your wallet — a signature request is waiting (no gas fee)
            </p>
          </div>
        ) : signInError ? (
          /* User rejected the signature or an error occurred */
          <div className="flex flex-col items-center gap-3">
            <ErrorAlert message={signInError} className="max-w-sm" />
            <button
              type="button"
              onClick={() => { void signIn(); }}
              className="rounded-xl bg-indigo-600 px-8 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Try Again
            </button>
            <p className="text-xs text-gray-400">
              Sign the message in your wallet to continue (no gas fee)
            </p>
          </div>
        ) : (
          /* Wallet connected, auto-sign-in about to trigger */
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner size="lg" />
            <p className="text-sm text-gray-500">Preparing sign-in…</p>
          </div>
        )}
      </div>

      {/* Network notice */}
      <p className="mt-8 rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-700 border border-amber-200">
        Testnet MVP — Sepolia only. Do not use real funds.
      </p>
    </div>
  );
}
