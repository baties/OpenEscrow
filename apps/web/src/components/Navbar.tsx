/**
 * Navbar.tsx — OpenEscrow Web Dashboard
 *
 * Top navigation bar component shown on all authenticated pages.
 * Handles: displaying the app logo, navigation links, wallet connect button,
 *          a sign-out action, and a mobile hamburger menu.
 * Does NOT: manage auth state (reads from useAuth), make API calls directly,
 *            or handle routing logic beyond Link components.
 *
 * Mobile menu: hidden by default on mobile. A hamburger icon toggles a dropdown
 * panel inside the sticky nav bar. Closes automatically on route change.
 */

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAuth } from '@/hooks/use-auth';
import { TokenBalances } from '@/components/TokenBalances';
import { NotificationBell } from '@/components/NotificationBell';

/**
 * Navigation link item definition.
 */
interface NavLink {
  href: string;
  label: string;
}

const NAV_LINKS: NavLink[] = [
  { href: '/deals', label: 'My Deals' },
  { href: '/deals/new', label: 'New Deal' },
  { href: '/settings/telegram', label: 'Telegram' },
  { href: '/help', label: 'Help' },
];

/**
 * Renders the top navigation bar with logo, nav links, wallet button, and sign-out.
 * Includes a hamburger menu for mobile viewports (visible below sm breakpoint).
 * The sign-out button is only shown when the user is authenticated.
 *
 * @returns JSX.Element — the navigation bar
 */
export function Navbar() {
  const pathname = usePathname();
  const { isAuthenticated, signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  const visibleLinks = NAV_LINKS.filter(({ href }) => isAuthenticated || href === '/help');

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
      {/* ── Main bar ─────────────────────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-indigo-600">
          <span aria-hidden="true">🔐</span>
          <span>OpenEscrow</span>
        </Link>

        {/* Desktop nav links — hidden on mobile */}
        <div className="hidden items-center gap-6 sm:flex">
          {visibleLinks.map(({ href, label }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`text-sm font-medium transition-colors hover:text-indigo-600 ${
                  isActive ? 'text-indigo-600' : 'text-gray-600'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Right side: wallet + token balances + notifications + sign-out + hamburger */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* USDC/USDT balances — shown when wallet is connected */}
          <TokenBalances />
          {/* Notification bell — shown when authenticated */}
          {isAuthenticated && <NotificationBell />}
          <ConnectButton accountStatus="avatar" chainStatus="none" showBalance={false} />
          {/* Sign out — desktop only (mobile sign-out is in the dropdown) */}
          {isAuthenticated && (
            <button
              type="button"
              onClick={signOut}
              className="hidden rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-red-300 hover:text-red-600 sm:block"
            >
              Sign out
            </button>
          )}
          {/* Hamburger button — mobile only */}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:hidden"
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          >
            {isMobileMenuOpen ? (
              /* X icon */
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            ) : (
              /* Hamburger icon */
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Mobile dropdown menu ──────────────────────────────────────────────── */}
      {isMobileMenuOpen && (
        <div className="border-t border-gray-100 bg-white sm:hidden">
          <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
            {/* Nav links */}
            <nav className="flex flex-col gap-1">
              {visibleLinks.map(({ href, label }) => {
                const isActive = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-indigo-50 hover:text-indigo-600 ${
                      isActive ? 'bg-indigo-50 text-indigo-600' : 'text-gray-700'
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
            {/* Sign out — mobile only */}
            {isAuthenticated && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <button
                  type="button"
                  onClick={signOut}
                  className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
