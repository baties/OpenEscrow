/**
 * use-auth.ts — OpenEscrow Web Dashboard
 *
 * Custom hook providing access to the authentication state and SIWE sign-in flow.
 * Handles: reading auth context, initiating the nonce → sign → verify SIWE flow,
 *          signing out (clearing JWT + disconnecting wallet).
 * Does NOT: interact with the API directly (delegates to api-client.ts),
 *            manage wallet connection state (that's wagmi's job),
 *            render any UI.
 *
 * This hook must be used inside <AuthProvider> (see providers/AuthProvider.tsx).
 */

'use client';

import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from '@/providers/AuthProvider';

/**
 * Returns the current authentication context value.
 * Must be called within a component tree wrapped by <AuthProvider>.
 *
 * @returns AuthContextValue containing isAuthenticated, walletAddress, signIn, signOut
 * @throws {Error} If called outside of <AuthProvider>
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
}
