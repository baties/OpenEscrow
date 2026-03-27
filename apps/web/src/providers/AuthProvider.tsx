/**
 * AuthProvider.tsx — OpenEscrow Web Dashboard
 *
 * React context provider for SIWE authentication state.
 * Handles: SIWE sign-in flow (nonce → sign → verify), sign-out, JWT persistence,
 *          listening for 'auth:expired' events from the API client.
 * Does NOT: manage wallet connection (that's RainbowKit/wagmi),
 *            make direct API calls (delegates to api-client.ts),
 *            render any UI beyond the context tree.
 *
 * Auth token is stored in localStorage — see auth-storage.ts for rationale.
 *
 * Sign-in trigger: SIWE is triggered via useAccountEffect.onConnect ONLY when the
 * user explicitly clicks "Connect Wallet" (isReconnected === false). Page-load
 * auto-reconnects (isReconnected === true) do NOT trigger SIWE — the stored JWT
 * is restored from localStorage instead. This prevents unwanted signature popups
 * on page refresh or after sign-out.
 *
 * Reconnect bug fix: On the initial render, wagmi reports isConnected=false before
 * it has had a chance to restore the previous connection from IndexedDB/localStorage.
 * Without a guard, the isConnected effect fires immediately with isConnected=false,
 * calls clearAuth() which deletes the JWT, then wagmi reconnects but finds no JWT.
 * hasMountedRef guards against this: the disconnect-handling branch of the isConnected
 * effect is skipped on the very first render so wagmi can reconnect first.
 *
 * Stale-closure guard: useAccountEffect.onConnect fires before wagmi re-renders,
 * so address/chainId from useAccount() are still the old (undefined) values at that
 * moment. The internal performSiwe() helper takes explicit addr/chain params from
 * the onConnect event to avoid reading stale hook state.
 *
 * Session persistence: JWT lives in localStorage with a 24h expiry (configurable
 * via JWT_EXPIRY env var). On page reload the stored JWT is restored without any
 * additional user action, as long as the same wallet is still connected.
 */

'use client';

import { createContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useAccount, useAccountEffect, useSignMessage, useDisconnect } from 'wagmi';
import { authApi } from '@/lib/api-client';
import { saveAuth, getAuthToken, getStoredWalletAddress, clearAuth } from '@/lib/auth-storage';
import { buildSiweMessage } from '@/lib/siwe';
import { config } from '@/lib/config';
import { getErrorMessage } from '@/lib/errors';

/**
 * Shape of the authentication context value.
 * Consumers can check isAuthenticated and call signIn / signOut.
 */
export interface AuthContextValue {
  /** True if a valid JWT is stored and the wallet is connected */
  isAuthenticated: boolean;
  /** The authenticated wallet address (lowercase), or null */
  walletAddress: string | null;
  /** True while the SIWE sign-in flow is in progress */
  isSigningIn: boolean;
  /** Error message from the last failed sign-in attempt, null if none */
  signInError: string | null;
  /**
   * Initiates the SIWE sign-in flow for the currently connected wallet.
   * No-op if no wallet is connected or user is already authenticated.
   *
   * @returns void
   */
  signIn: () => Promise<void>;
  /**
   * Signs the user out: clears JWT from storage and disconnects the wallet.
   *
   * @returns void
   */
  signOut: () => void;
}

/**
 * The React context. Default value is null — enforced by the useAuth hook.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Props for the AuthProvider component.
 */
interface AuthProviderProps {
  /** Child components that need access to auth state */
  children: ReactNode;
}

/**
 * Provides authentication state and SIWE sign-in/out to the component tree.
 * Must wrap all components that use the useAuth hook.
 *
 * @param props - Children to render within the auth context
 * @returns JSX.Element — the context provider wrapping children
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const { address, chainId, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  /**
   * Guards against clearing auth on the initial render before wagmi reconnects.
   * See the module-level comment for a full explanation of the race condition.
   */
  const hasMountedRef = useRef(false);

  // On mount: restore auth from localStorage so authenticated users skip sign-in
  // on page reload without any additional action.
  useEffect(() => {
    const storedToken = getAuthToken();
    const storedAddress = getStoredWalletAddress();
    if (storedToken && storedAddress) {
      setIsAuthenticated(true);
      setWalletAddress(storedAddress);
    }
  }, []);

  // When wallet address changes (e.g. user switches accounts in MetaMask):
  // validate the stored JWT still belongs to the connected wallet.
  // A clean disconnect (address === undefined) also clears auth here.
  //
  // IMPORTANT: skip the very first run. On initial render, wagmi reports
  // isConnected=false before it has restored the previous connection.
  // We must not call clearAuth() at that point or we erase the stored JWT
  // before wagmi gets to reconnect. hasMountedRef becomes true after the
  // first fire so all subsequent changes (real disconnects, wallet switches)
  // are handled normally.
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    if (!isConnected || !address) {
      clearAuth();
      setIsAuthenticated(false);
      setWalletAddress(null);
      return;
    }

    const storedAddress = getStoredWalletAddress();
    const storedToken = getAuthToken();

    if (storedToken && storedAddress?.toLowerCase() === address.toLowerCase()) {
      // Valid JWT for the connected wallet — keep the session alive
      setIsAuthenticated(true);
      setWalletAddress(storedAddress);
    } else {
      // Different wallet — clear stale token and wait for explicit sign-in
      clearAuth();
      setIsAuthenticated(false);
      setWalletAddress(null);
    }
  }, [isConnected, address]);

  // Listen for 'auth:expired' custom events dispatched by the API client on 401
  useEffect(() => {
    const handleAuthExpired = () => {
      clearAuth();
      setIsAuthenticated(false);
      setWalletAddress(null);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('auth:expired', handleAuthExpired);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('auth:expired', handleAuthExpired);
      }
    };
  }, []);

  /**
   * Core SIWE flow — accepts explicit addr/chainId to avoid stale React hook values.
   * Called by both onConnect (with event params) and the manual signIn (with hook values).
   *
   * @param addr - Wallet address to authenticate
   * @param chain - Chain ID to include in the SIWE message
   * @returns void
   */
  const performSiwe = useCallback(
    async (addr: string, chain: number): Promise<void> => {
      if (isAuthenticated) return;

      setIsSigningIn(true);
      setSignInError(null);

      try {
        const { nonce } = await authApi.getNonce(addr);

        const message = buildSiweMessage({ address: addr, chainId: chain, nonce });
        const signature = await signMessageAsync({ message });
        const { token } = await authApi.verify(message, signature);

        saveAuth(token, addr);
        setIsAuthenticated(true);
        setWalletAddress(addr.toLowerCase());
      } catch (err) {
        const msg = getErrorMessage(err);
        console.error('[AuthProvider] signIn failed:', { error: msg });
        setSignInError(msg);
      } finally {
        setIsSigningIn(false);
      }
    },
    [isAuthenticated, signMessageAsync]
  );

  /**
   * Public sign-in for manual trigger (e.g. "Sign in with Ethereum" button).
   * Reads address/chainId from wagmi hook state — only call after wallet is connected.
   *
   * @returns void
   */
  const signIn = useCallback(async (): Promise<void> => {
    if (!address || !isConnected) {
      setSignInError('Connect your wallet first.');
      return;
    }
    await performSiwe(address, chainId ?? config.chainId);
  }, [address, chainId, isConnected, performSiwe]);

  // Trigger SIWE ONLY when the user explicitly connects a wallet.
  // isReconnected === true means wagmi restored a previous connection on page load
  // — we must NOT prompt the user in that case (the stored JWT covers the session).
  //
  // IMPORTANT: we use connectedAddress/connectedChainId from the event params, NOT
  // the address/chainId from useAccount(). onConnect fires before wagmi re-renders,
  // so hook state is still the old (undefined) values at this point in time.
  useAccountEffect({
    onConnect({ address: connectedAddress, chainId: connectedChainId, isReconnected }) {
      if (!isReconnected) {
        void performSiwe(connectedAddress, connectedChainId ?? config.chainId);
      }
    },
  });

  const signOut = useCallback((): void => {
    clearAuth();
    setIsAuthenticated(false);
    setWalletAddress(null);
    setSignInError(null);
    disconnect();
  }, [disconnect]);

  const contextValue: AuthContextValue = {
    isAuthenticated,
    walletAddress,
    isSigningIn,
    signInError,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}
