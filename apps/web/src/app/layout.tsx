/**
 * layout.tsx — OpenEscrow Web Dashboard
 *
 * Root Next.js App Router layout.
 * Handles: HTML shell, global styles import, provider tree setup,
 *          shared Navbar component.
 * Does NOT: contain page-specific content, manage auth state directly,
 *            or fetch any data.
 *
 * Provider order (outer → inner): Web3Provider → AuthProvider
 * Web3Provider must be outermost because AuthProvider uses wagmi hooks.
 */

import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import '@rainbow-me/rainbowkit/styles.css';
import '@/styles/globals.css';
import { AuthProvider } from '@/providers/AuthProvider';
import { Navbar } from '@/components/Navbar';

/**
 * Web3Provider loaded client-side only (ssr: false) to prevent wagmi/WalletConnect
 * from accessing browser-only APIs (indexedDB, localStorage) during SSR.
 * These connectors call setup() at module load time which crashes in Node.js.
 */
const Web3Provider = dynamic(
  () => import('@/providers/Web3Provider').then((m) => ({ default: m.Web3Provider })),
  { ssr: false }
);

/**
 * Next.js metadata for the OpenEscrow app.
 */
export const metadata: Metadata = {
  title: {
    default: 'OpenEscrow',
    template: '%s | OpenEscrow',
  },
  description:
    'Milestone-based on-chain escrow for freelancers and Web3 projects. Secure USDC/USDT payments with milestone verification.',
  keywords: ['escrow', 'Web3', 'freelance', 'USDC', 'USDT', 'Ethereum', 'Sepolia'],
};

/**
 * Root layout wrapping all pages with provider tree and shared navigation.
 *
 * @param props - Object containing children (the current page content)
 * @returns The HTML document shell with providers and navbar
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <Web3Provider>
          <AuthProvider>
            <Navbar />
            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
          </AuthProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
