/**
 * Web3Provider.tsx — OpenEscrow Web Dashboard
 *
 * Root provider for wagmi + RainbowKit wallet connection.
 * Handles: configuring wagmi chains, transport, and RainbowKit theming.
 * Does NOT: manage auth state (that's AuthProvider's job),
 *            make any API calls, or render any UI beyond the provider tree.
 *
 * One chain per deployment: only the active chain (NEXT_PUBLIC_CHAIN_ID) is
 * registered in wagmiConfig. Registering all chains causes wagmi to make
 * read calls against every chain's default RPC (e.g. eth.merkle.io for mainnet),
 * which blocks CORS from localhost and wastes bandwidth in production.
 * Chain display metadata for all supported chains lives in CHAIN_META (lib/config.ts).
 *
 * Supported chain IDs: 11155111 (Sepolia), 1 (Mainnet), 56 (BSC), 137 (Polygon).
 * To add a chain: add it to the CHAIN_BY_ID map below and to CHAIN_META in config.ts.
 *
 * RPC transport: all wagmi read calls are routed through /api/rpc (a Next.js
 * server-side proxy) when NEXT_PUBLIC_RPC_URL is configured. This avoids browser
 * CORS restrictions on public RPC endpoints entirely.
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

// ─── Chain registry ────────────────────────────────────────────────────────────
// Only the active chain is passed to wagmiConfig. All supported chain objects are
// kept here for the lookup — add new chains here AND in CHAIN_META in config.ts.
const CHAIN_BY_ID = {
  11155111: sepolia,
  1: mainnet,
  56: bsc,
  137: polygon,
} as const;

type SupportedChainId = keyof typeof CHAIN_BY_ID;

/** The single wagmi chain for this deployment, driven by NEXT_PUBLIC_CHAIN_ID. */
const activeChain = CHAIN_BY_ID[appConfig.chainId as SupportedChainId] ?? sepolia;

// ─── WalletConnect disable flag ───────────────────────────────────────────────
// When NEXT_PUBLIC_DISABLE_WALLETCONNECT=true (set in docker-compose.override.yml
// for local dev), WalletConnect and Rainbow wallets are excluded from the connector
// list. This prevents the WalletConnect v2 SDK from initialising on page load and
// making calls to external endpoints that block requests from localhost origins.
// MetaMask and Coinbase wallets remain fully functional without WalletConnect.
// This flag has no effect in production (it is never set on the VPS).
const WALLETCONNECT_DISABLED = process.env.NEXT_PUBLIC_DISABLE_WALLETCONNECT === 'true';

// ─── wagmi + RainbowKit configuration ────────────────────────────────────────
// In production: 4 wallets (MetaMask, Coinbase, WalletConnect, Rainbow).
// Locally: 2 wallets (MetaMask, Coinbase) — WalletConnect SDK not initialised.
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popular',
      wallets: WALLETCONNECT_DISABLED
        ? [metaMaskWallet, coinbaseWallet]
        : [metaMaskWallet, coinbaseWallet, walletConnectWallet, rainbowWallet],
    },
  ],
  {
    appName: 'OpenEscrow',
    projectId: appConfig.walletConnectProjectId,
  }
);

/**
 * wagmi client config — only the active chain is registered.
 * Transport routes through NEXT_PUBLIC_RPC_URL (/api/rpc proxy) when configured,
 * otherwise falls back to the chain's built-in public RPC endpoint.
 * Uses HTTP transport only (no WebSocket per CLAUDE.md Section C).
 */
const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors,
  transports: {
    [activeChain.id]: appConfig.rpcUrl ? http(appConfig.rpcUrl) : http(),
  } as Record<number, ReturnType<typeof http>>,
  ssr: true,
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
