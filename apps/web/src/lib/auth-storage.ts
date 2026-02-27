/**
 * auth-storage.ts — OpenEscrow Web Dashboard
 *
 * Persistence layer for the JWT issued after SIWE authentication.
 * Handles: storing, reading, and clearing the auth token in localStorage.
 * Does NOT: validate the JWT, refresh it, or interact with the API.
 *
 * Decision: localStorage is used over httpOnly cookies because:
 * - The API is on a different origin (port 3001), making cross-site cookies
 *   more complex to configure correctly.
 * - The token is non-sensitive relative to the level of risk in this MVP
 *   (testnet-only, no real funds at stake until mainnet audit).
 * - localStorage is simpler to implement without a BFF proxy layer.
 * Trade-off: XSS could steal the token. Mitigation: strict CSP headers (post-MVP hardening).
 */

const AUTH_TOKEN_KEY = 'open_escrow_jwt';
const WALLET_ADDRESS_KEY = 'open_escrow_wallet';

/**
 * Persists the JWT and associated wallet address to localStorage.
 *
 * @param token - The JWT string issued by the API after SIWE verification
 * @param walletAddress - The lowercase wallet address associated with this session
 * @returns void
 */
export function saveAuth(token: string, walletAddress: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(WALLET_ADDRESS_KEY, walletAddress.toLowerCase());
}

/**
 * Reads the stored JWT from localStorage.
 *
 * @returns The JWT string, or null if not present
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

/**
 * Reads the stored wallet address from localStorage.
 *
 * @returns The lowercase wallet address, or null if not present
 */
export function getStoredWalletAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(WALLET_ADDRESS_KEY);
}

/**
 * Checks whether a JWT is currently stored (user appears to be authenticated).
 * Does NOT verify the token's validity or expiry.
 *
 * @returns True if a token exists in localStorage
 */
export function isAuthenticated(): boolean {
  return getAuthToken() !== null;
}

/**
 * Removes the JWT and wallet address from localStorage, effectively signing out.
 *
 * @returns void
 */
export function clearAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(WALLET_ADDRESS_KEY);
}
