/**
 * PartyRow.tsx — OpenEscrow Web Dashboard
 *
 * Handles: Rendering one labeled row of party information (ID or wallet address).
 *          Addresses open the block explorer on click with the full address in a
 *          tooltip on hover. IDs copy to clipboard on click.
 *          Values longer than 10 chars are truncated to xxxx.....xxxx format.
 * Does NOT: fetch data, manage auth, or contain business logic.
 *
 * Used by DealCard (deals list) and the deal detail page header.
 */

'use client';

import { useState, useCallback } from 'react';

/**
 * Props for the PartyRow component.
 */
interface PartyRowProps {
  /** Row label shown before the colon, e.g. "Your ID", "To Address" */
  label: string;
  /** Full value — truncated in the UI, shown in full via hover tooltip */
  value: string;
  /**
   * What happens when the user clicks the value:
   *   "copy"     — copies full value to the clipboard
   *   "explorer" — opens explorerUrl in a new tab
   */
  action: 'copy' | 'explorer';
  /** Full block-explorer URL. Required when action === "explorer". */
  explorerUrl?: string;
  /** Extra Tailwind classes applied to the outer row wrapper */
  className?: string;
}

/**
 * Truncates a value for compact display while preserving recognisability.
 *   Short values (≤10 chars, e.g. platform usernames) → shown in full
 *   "0x"-prefixed addresses → "0x1234.....5678"
 *   UUIDs and other long strings → "0ef69ad5.....b491"
 *
 * @param value - The full string to truncate
 * @returns Truncated display string
 */
function truncateValue(value: string): string {
  if (value.length <= 10) return value; // usernames (max 10 chars) shown in full
  if (value.startsWith('0x')) {
    return `${value.slice(0, 6)}.....${value.slice(-4)}`;
  }
  return `${value.slice(0, 8)}.....${value.slice(-4)}`;
}

/**
 * Renders one labeled row showing a truncated value with an interactive action.
 * Hover the value to see the full text in a tooltip.
 * Click to copy (IDs) or open the block explorer (addresses).
 * All click handlers stop propagation so this is safe inside a <Link> card wrapper.
 *
 * @param props - Label, full value, action type, and optional explorer URL
 * @returns Single-row JSX element
 */
export function PartyRow({ label, value, action, explorerUrl, className = '' }: PartyRowProps) {
  const [copied, setCopied] = useState(false);

  /**
   * Copies the full value to the clipboard.
   * Stops propagation so parent card Link does not navigate.
   *
   * @param e - Mouse event
   * @returns void
   */
  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // Clipboard API may be blocked in some browsers — fail silently
      }
    },
    [value]
  );

  const display = truncateValue(value);

  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <span className="shrink-0 text-xs text-gray-400">{label}:</span>

      {action === 'explorer' && explorerUrl ? (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={value}
          onClick={(e) => e.stopPropagation()}
          className="flex min-w-0 items-center gap-0.5 font-mono text-xs text-indigo-600 transition-colors hover:text-indigo-800 hover:underline"
        >
          <span className="truncate">{display}</span>
          {/* External link icon */}
          <svg
            className="h-2.5 w-2.5 shrink-0"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
              clipRule="evenodd"
            />
            <path
              fillRule="evenodd"
              d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
              clipRule="evenodd"
            />
          </svg>
        </a>
      ) : (
        <button
          type="button"
          title={copied ? 'Copied!' : value}
          onClick={(e) => void handleCopy(e)}
          className="flex min-w-0 items-center gap-0.5 font-mono text-xs text-gray-700 transition-colors hover:text-indigo-600"
        >
          <span className="truncate">{display}</span>
          {copied ? (
            <svg
              className="h-2.5 w-2.5 shrink-0 text-emerald-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg
              className="h-2.5 w-2.5 shrink-0 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
