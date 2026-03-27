/**
 * page.tsx — OpenEscrow Web Dashboard (Home / Landing)
 *
 * Home page displayed to unauthenticated and authenticated users.
 * Handles: wallet connect prompt, SIWE status display, redirect to /deals when authed.
 * Does NOT: fetch any data, manage auth state (reads via useAuth hook),
 *            or contain any business logic.
 *
 * Auth UX:
 *   - User clicks "Connect Wallet" → SIWE signature is requested automatically.
 *   - Page-load reconnect (wagmi restoring previous connection) → existing JWT is used;
 *     if no JWT exists, a manual "Sign in with Ethereum" button is shown.
 *   - Signature rejected → error + "Try Again" button.
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { useAuth } from '@/hooks/use-auth';
import { ErrorAlert } from '@/components/ErrorAlert';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { config } from '@/lib/config';

/**
 * Truncates a wallet address to the form 0x1234…abcd for compact display.
 *
 * @param addr - Full hex wallet address
 * @returns Truncated address string
 */
function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Home page component.
 * Redirects authenticated users to /deals.
 * Shows wallet connect + SIWE sign-in flow for unauthenticated users.
 *
 * @returns Home page JSX
 */
export default function HomePage() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const { isAuthenticated, isSigningIn, signInError, signIn, signOut } = useAuth();

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
          Lock USDC or USDT in a smart contract. Get paid on verified milestones. No disputes, no
          trust required — just on-chain accountability.
        </p>
      </div>

      {/* Feature highlights */}
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            icon: '🔐',
            title: 'Funds locked on-chain',
            desc: `USDC/USDT secured in a smart contract on ${config.chainMeta.name}`,
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
            <span className="text-2xl" aria-hidden="true">
              {icon}
            </span>
            <h3 className="mt-2 font-semibold text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">{desc}</p>
          </div>
        ))}
      </div>

      {/* Auth flow */}
      <div className="flex flex-col items-center gap-4">
        {!isConnected ? (
          /* Step 1 — wallet not connected */
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-gray-500">Connect your wallet to get started</p>
            <ConnectButton label="Connect Wallet" />
            <p className="text-xs text-gray-400">
              Supports MetaMask, Coinbase Wallet, WalletConnect
            </p>
          </div>
        ) : isSigningIn ? (
          /* Step 2 — wallet connected, SIWE signature request pending */
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner size="lg" />
            <p className="text-sm font-medium text-gray-700">Waiting for signature…</p>
            {address && (
              <p className="text-xs text-gray-500 font-mono">{truncateAddress(address)}</p>
            )}
            <p className="text-xs text-gray-400">
              Check your wallet — sign the message to continue (no gas fee)
            </p>
          </div>
        ) : signInError ? (
          /* Step 2 error — signature rejected or API error */
          <div className="flex flex-col items-center gap-4">
            <ErrorAlert
              message={
                signInError.toLowerCase().includes('rejected') ||
                signInError.toLowerCase().includes('denied') ||
                signInError.toLowerCase().includes('user rejected')
                  ? 'Signature cancelled. Click "Try Again" to sign in.'
                  : signInError
              }
              className="max-w-sm"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  void signIn();
                }}
                className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={signOut}
                className="rounded-xl border border-gray-300 bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                Disconnect
              </button>
            </div>
            {address && (
              <p className="text-xs text-gray-400">
                Connected: <span className="font-mono">{truncateAddress(address)}</span>
              </p>
            )}
          </div>
        ) : (
          /* Wallet connected but no JWT — happens on page-load reconnect without a stored
             session. useAccountEffect won't fire SIWE here (isReconnected=true), so the
             user needs to sign in manually. */
          <div className="flex flex-col items-center gap-3">
            {address && (
              <p className="text-xs text-gray-500">
                Wallet connected:{' '}
                <span className="font-mono font-medium">{truncateAddress(address)}</span>
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                void signIn();
              }}
              className="rounded-xl bg-indigo-600 px-8 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
            >
              Sign in with Ethereum
            </button>
            <p className="text-xs text-gray-400">Sign a message to verify ownership (no gas fee)</p>
            <button
              type="button"
              onClick={signOut}
              className="text-xs text-gray-400 underline hover:text-gray-600"
            >
              Use a different wallet
            </button>
          </div>
        )}
      </div>

      {/* Network notice — testnet warning shown only when running on a testnet */}
      {config.chainMeta.isTestnet && (
        <p className="mt-8 rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-700 border border-amber-200">
          Testnet MVP — {config.chainMeta.name} only. Do not use real funds.
        </p>
      )}
    </div>
  );
}
