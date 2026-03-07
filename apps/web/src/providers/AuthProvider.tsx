/**
 * AuthProvider.tsx — OpenEscrow Web Dashboard
 *
 * React context provider for SIWE authentication state.
 * Handles: SIWE sign-in flow (nonce → sign → verify), sign-out, JWT persistence,
 *          auto-sign-in when wallet connects, listening for 'auth:expired' events.
 * Does NOT: manage wallet connection (that's RainbowKit/wagmi),
 *            make direct API calls (delegates to api-client.ts),
 *            render any UI beyond the context tree.
 *
 * Auth token is stored in localStorage — see auth-storage.ts for rationale.
 *
 * Auto sign-in: SIWE is triggered automatically when the wallet connects so the
 * user only needs one action (connecting the wallet). If the user rejects the
 * signature, `signInError` is set and they can retry manually via signIn().
 *
 * Reconnect safety: wagmi briefly sets isConnected=false while reconnecting on
 * page load. We guard against that with isReconnecting/isConnecting so a page
 * refresh never clears auth unnecessarily.
 */

'use client';

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { useAccount, useSignMessage, useDisconnect } from 'wagmi';
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
  const { address, chainId, isConnected, isConnecting, isReconnecting } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // On mount: restore auth state from localStorage if wallet matches stored address
  useEffect(() => {
    const storedToken = getAuthToken();
    const storedAddress = getStoredWalletAddress();
    if (storedToken && storedAddress) {
      setIsAuthenticated(true);
      setWalletAddress(storedAddress);
    }
  }, []);

  // When wallet connects/disconnects: validate stored auth matches connected wallet.
  // Guard: skip during transient reconnecting states (wagmi briefly shows
  // isConnected=false on page load before restoring the connection — clearing auth
  // here would force a re-sign on every page refresh).
  useEffect(() => {
    if (isConnecting || isReconnecting) return;

    if (!isConnected || !address) {
      // True wallet disconnect (user explicitly disconnected, not just page load)
      clearAuth();
      setIsAuthenticated(false);
      setWalletAddress(null);
      return;
    }

    const storedAddress = getStoredWalletAddress();
    const storedToken = getAuthToken();

    if (storedToken && storedAddress?.toLowerCase() === address.toLowerCase()) {
      // Valid JWT exists for this wallet — restore session without re-signing
      setIsAuthenticated(true);
      setWalletAddress(storedAddress);
    } else {
      // Different wallet connected, or no stored token — clear stale auth
      clearAuth();
      setIsAuthenticated(false);
      setWalletAddress(null);
    }
  }, [isConnected, isConnecting, isReconnecting, address]);

  // Listen for 'auth:expired' events dispatched by the API client on 401 responses
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

  const signIn = useCallback(async (): Promise<void> => {
    if (!address || !isConnected) {
      setSignInError('Connect your wallet first.');
      return;
    }
    if (isAuthenticated) {
      return; // Already authenticated
    }

    setIsSigningIn(true);
    setSignInError(null);

    try {
      // Step 1: Get nonce from API
      const { nonce } = await authApi.getNonce(address);

      // Step 2: Build SIWE message
      const message = buildSiweMessage({
        address,
        chainId: chainId ?? config.chainId,
        nonce,
      });

      // Step 3: Ask wallet to sign the message
      const signature = await signMessageAsync({ message });

      // Step 4: Send message + signature to API, get JWT
      const { token } = await authApi.verify(message, signature);

      // Step 5: Persist and update state
      // Use `address` directly — the API verified it, and we already have it from useAccount().
      saveAuth(token, address);
      setIsAuthenticated(true);
      setWalletAddress(address.toLowerCase());
    } catch (err) {
      const message = getErrorMessage(err);
      console.error('[AuthProvider] signIn failed:', { error: message });
      setSignInError(message);
    } finally {
      setIsSigningIn(false);
    }
  }, [address, chainId, isConnected, isAuthenticated, signMessageAsync]);

  // Auto sign-in: trigger SIWE immediately when a wallet connects and no valid
  // session exists for it. This removes the need for a manual "Sign in" button.
  // Skip if: already authenticated, already signing in, or the user previously
  // rejected the signature (signInError set) — they must retry manually.
  // NOTE: must be declared AFTER signIn useCallback to avoid TDZ reference error.
  useEffect(() => {
    if (
      isConnected &&
      !isConnecting &&
      !isReconnecting &&
      address &&
      !isAuthenticated &&
      !isSigningIn &&
      !signInError
    ) {
      void signIn();
    }
  }, [isConnected, isConnecting, isReconnecting, address, isAuthenticated, isSigningIn, signInError, signIn]);

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
