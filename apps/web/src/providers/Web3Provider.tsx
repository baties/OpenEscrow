/**
 * Web3Provider.tsx — OpenEscrow Web Dashboard
 *
 * Root provider for wagmi + RainbowKit wallet connection.
 * Handles: configuring wagmi chains, transport, and RainbowKit theming.
 * Does NOT: manage auth state (that's AuthProvider's job),
 *            make any API calls, or render any UI beyond the provider tree.
 *
 * Dependency: wagmi — React hooks for Ethereum wallet connection.
 * Why: specified in CLAUDE.md Section E as the wallet connection library.
 * Security: no private keys handled here; wagmi only manages connection state.
 * Bundle cost: ~50KB minified+gzipped (peer deps: viem, @tanstack/react-query).
 *
 * Dependency: @rainbow-me/rainbowkit — wallet connection UI.
 * Why: specified in CLAUDE.md Section E for wallet connection UI.
 * Security: no private keys; only handles connection UI flow.
 * Bundle cost: ~80KB minified+gzipped.
 *
 * Dependency: @tanstack/react-query — async state management required by wagmi.
 * Why: required by wagmi v2 for async state management.
 * Bundle cost: ~40KB minified+gzipped.
 */

'use client';

import { type ReactNode } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RainbowKitProvider,
  getDefaultWallets,
  connectorsForWallets,
  darkTheme,
  lightTheme,
} from '@rainbow-me/rainbowkit';
import { config as appConfig } from '@/lib/config';

// ─── wagmi + RainbowKit configuration ────────────────────────────────────────

const { wallets } = getDefaultWallets();

const connectors = connectorsForWallets(wallets, {
  appName: 'OpenEscrow',
  projectId: appConfig.walletConnectProjectId,
});

/**
 * wagmi client config — Sepolia testnet only for MVP.
 * Uses HTTP transport (no WebSocket per CLAUDE.md Section C).
 */
const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors,
  transports: {
    [sepolia.id]: http(),
  },
  ssr: true, // Required for Next.js App Router
});

/**
 * Single QueryClient instance for the entire app.
 * Configured with conservative defaults (no automatic background refetching
 * for blockchain data — we control polling ourselves).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      retry: 2,
    },
  },
});

/**
 * Props for the Web3Provider component.
 */
interface Web3ProviderProps {
  /** Child components that need wallet/chain access */
  children: ReactNode;
}

/**
 * Wraps the app with wagmi, react-query, and RainbowKit providers.
 * Must be a client component (wagmi hooks require client-side rendering).
 * Must be placed above AuthProvider in the component tree.
 *
 * @param props - Children to render within the web3 provider tree
 * @returns JSX.Element — nested provider components
 */
export function Web3Provider({ children }: Web3ProviderProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={{
            lightMode: lightTheme({
              accentColor: '#6366f1', // Indigo-500 — matches the app's primary color
              accentColorForeground: 'white',
              borderRadius: 'medium',
            }),
            darkMode: darkTheme({
              accentColor: '#818cf8', // Indigo-400 for dark mode
              accentColorForeground: 'white',
              borderRadius: 'medium',
            }),
          }}
          modalSize="compact"
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
