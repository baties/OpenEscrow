/**
 * Web3Provider.tsx — OpenEscrow Web Dashboard
 *
 * Root provider for wagmi + RainbowKit wallet connection.
 * Handles: configuring wagmi chains, transport, and RainbowKit theming.
 * Does NOT: manage auth state (that's AuthProvider's job),
 *            make any API calls, or render any UI beyond the provider tree.
 *
 * Multi-chain: all 4 supported chains are registered in the wagmi config so
 * RainbowKit can handle chain switching. The "active" chain (where the contract
 * is deployed) is driven by NEXT_PUBLIC_CHAIN_ID. The app enforces that the
 * user's wallet is on the active chain before any transaction.
 *
 * Supported chains: Sepolia (11155111), Ethereum Mainnet (1), BNB Smart Chain (56),
 * Polygon Mainnet (137). Add new chains here and to CHAIN_META in lib/config.ts.
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
import { sepolia, mainnet, bsc, polygon } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RainbowKitProvider,
  connectorsForWallets,
  darkTheme,
  lightTheme,
} from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  rainbowWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { config as appConfig } from '@/lib/config';

// ─── Chain registry ───────────────────────────────────────────────────────────
// All chains that OpenEscrow may be deployed on. New chains added here require
// a matching entry in CHAIN_META in lib/config.ts.
const ALL_CHAINS = [sepolia, mainnet, bsc, polygon] as const;

// ─── Transport configuration ──────────────────────────────────────────────────
// If NEXT_PUBLIC_RPC_URL is set, use it for the active chain's transport to
// avoid public RPC rate limits. All other chains fall back to their public RPCs.
function buildTransports() {
  const transports: Record<number, ReturnType<typeof http>> = {};
  for (const chain of ALL_CHAINS) {
    if (chain.id === appConfig.chainId && appConfig.rpcUrl) {
      // Custom RPC for the active chain (avoids public endpoint rate limits)
      transports[chain.id] = http(appConfig.rpcUrl);
    } else {
      transports[chain.id] = http();
    }
  }
  return transports;
}

// ─── wagmi + RainbowKit configuration ────────────────────────────────────────
// Limit to 4 common wallets so the compact modal stays genuinely compact.
// getDefaultWallets() returns ~8 wallets which makes the dialog appear large.
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: [metaMaskWallet, coinbaseWallet, walletConnectWallet, rainbowWallet],
    },
  ],
  {
    appName: 'OpenEscrow',
    projectId: appConfig.walletConnectProjectId,
  }
);

/**
 * wagmi client config — all 4 supported chains registered.
 * Active chain is determined by NEXT_PUBLIC_CHAIN_ID at build time.
 * Uses HTTP transport only (no WebSocket per CLAUDE.md Section C).
 */
const wagmiConfig = createConfig({
  chains: ALL_CHAINS,
  connectors,
  transports: buildTransports(),
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
