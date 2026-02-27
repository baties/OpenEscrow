/**
 * format.ts — OpenEscrow Web Dashboard
 *
 * Display formatting utilities for deal amounts, addresses, and dates.
 * Handles: converting raw token amounts (USDC/USDT with 6 decimals) to human-readable
 *          strings, truncating wallet addresses, formatting ISO timestamps.
 * Does NOT: perform any API calls, state management, or contain React components.
 *
 * USDC/USDT use 6 decimal places on EVM (not 18 like ETH).
 * Amounts in the API are stored as wei-like strings (smallest unit, 6 decimals).
 */

const STABLECOIN_DECIMALS = 6;
const STABLECOIN_DIVISOR = 10 ** STABLECOIN_DECIMALS;

/**
 * Converts a raw USDC/USDT amount string (in 6-decimal units) to a human-readable
 * decimal string. E.g. "1000000" → "1.00".
 *
 * @param rawAmount - Raw token amount as string (smallest unit, 6 decimals)
 * @param decimalPlaces - Number of decimal places to display (default: 2)
 * @returns Formatted amount string, e.g. "500.00" or "1,250.50"
 */
export function formatTokenAmount(rawAmount: string, decimalPlaces = 2): string {
  try {
    const value = BigInt(rawAmount);
    const wholePart = value / BigInt(STABLECOIN_DIVISOR);
    const fractionalPart = value % BigInt(STABLECOIN_DIVISOR);

    // Convert to floating-point for display only (precision is fine for display)
    const floatValue = Number(wholePart) + Number(fractionalPart) / STABLECOIN_DIVISOR;
    return floatValue.toLocaleString('en-US', {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    });
  } catch {
    return '0.00';
  }
}

/**
 * Converts a human-readable decimal amount to raw token units (6 decimals).
 * E.g. "1.50" → "1500000".
 * Used for converting form input values before sending to the API.
 *
 * @param amount - Human-readable decimal string, e.g. "1500.00"
 * @returns Raw amount string in smallest units (6 decimals)
 * @throws {Error} If the input is not a valid non-negative number
 */
export function parseTokenAmount(amount: string): string {
  const floatValue = parseFloat(amount);
  if (!Number.isFinite(floatValue) || floatValue < 0) {
    throw new Error(`Invalid token amount: ${amount}`);
  }
  // Multiply by 10^6 and round to avoid floating-point issues
  const rawValue = Math.round(floatValue * STABLECOIN_DIVISOR);
  return rawValue.toString();
}

/**
 * Truncates an Ethereum wallet address for compact display.
 * E.g. "0x1234...5678" from "0x1234abcd5678ef..."
 *
 * @param address - The full hex wallet address
 * @param prefixChars - Number of chars to show after "0x" (default: 4)
 * @param suffixChars - Number of chars to show at the end (default: 4)
 * @returns Truncated address string
 */
export function truncateAddress(address: string, prefixChars = 4, suffixChars = 4): string {
  if (!address || address.length < prefixChars + suffixChars + 2) {
    return address ?? '';
  }
  return `${address.slice(0, prefixChars + 2)}...${address.slice(-suffixChars)}`;
}

/**
 * Formats an ISO 8601 timestamp string for display.
 * E.g. "2024-01-15T10:30:00.000Z" → "Jan 15, 2024, 10:30 AM"
 *
 * @param isoString - ISO 8601 timestamp string
 * @param locale - BCP 47 locale tag (default: 'en-US')
 * @returns Formatted date-time string, or "—" if input is null/undefined
 */
export function formatDate(isoString: string | null | undefined, locale = 'en-US'): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    return date.toLocaleString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Returns a relative time string from a timestamp, e.g. "3 hours ago".
 *
 * @param isoString - ISO 8601 timestamp string
 * @returns Relative time string
 */
export function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) return 'just now';
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    return `${Math.floor(diffSecs / 86400)}d ago`;
  } catch {
    return '—';
  }
}

/**
 * Maps a DealStatus or MilestoneStatus string to a display-friendly label.
 *
 * @param status - The status string from the API
 * @returns A human-readable label for the status
 */
export function formatStatus(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Draft',
    AGREED: 'Agreed',
    FUNDED: 'Funded',
    SUBMITTED: 'Submitted',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    REVISION: 'In Revision',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    PENDING: 'Pending',
  };
  return labels[status] ?? status;
}

/**
 * Returns the Tailwind CSS color classes for a given status badge.
 *
 * @param status - The status string from the API
 * @returns Tailwind CSS classes for background and text color
 */
export function getStatusBadgeClasses(status: string): string {
  const classes: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-700',
    AGREED: 'bg-blue-100 text-blue-700',
    FUNDED: 'bg-indigo-100 text-indigo-700',
    SUBMITTED: 'bg-yellow-100 text-yellow-700',
    APPROVED: 'bg-green-100 text-green-700',
    REJECTED: 'bg-red-100 text-red-700',
    REVISION: 'bg-orange-100 text-orange-700',
    COMPLETED: 'bg-emerald-100 text-emerald-700',
    CANCELLED: 'bg-gray-100 text-gray-500',
    PENDING: 'bg-gray-100 text-gray-600',
  };
  return classes[status] ?? 'bg-gray-100 text-gray-600';
}
