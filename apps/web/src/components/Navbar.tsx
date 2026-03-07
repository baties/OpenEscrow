/**
 * Navbar.tsx — OpenEscrow Web Dashboard
 *
 * Top navigation bar component shown on all authenticated pages.
 * Handles: displaying the app logo, navigation links, wallet connect button,
 *          and a sign-out action.
 * Does NOT: manage auth state (reads from useAuth), make API calls,
 *            or handle routing logic beyond Link components.
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAuth } from '@/hooks/use-auth';

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
 * The sign-out button is only shown when the user is authenticated.
 *
 * @returns JSX.Element — the navigation bar
 */
export function Navbar() {
  const pathname = usePathname();
  const { isAuthenticated, signOut } = useAuth();

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-indigo-600">
          <span aria-hidden="true">🔐</span>
          <span>OpenEscrow</span>
        </Link>

        {/* Nav links — authenticated links hidden when not signed in, Help always visible */}
        <div className="hidden items-center gap-6 sm:flex">
          {NAV_LINKS.filter(({ href }) => isAuthenticated || href === '/help').map(
            ({ href, label }) => {
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
            }
          )}
        </div>

        {/* Wallet connect + sign out */}
        <div className="flex items-center gap-3">
          <ConnectButton accountStatus="avatar" chainStatus="none" showBalance={false} />
          {isAuthenticated && (
            <button
              type="button"
              onClick={signOut}
              className="hidden rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:border-red-300 hover:text-red-600 sm:block"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
