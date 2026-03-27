/**
 * CopyButton.tsx — OpenEscrow Web Dashboard
 *
 * Reusable copy-to-clipboard button component.
 * Handles: copying text to the clipboard, showing transient "Copied!" feedback,
 *          graceful fallback when clipboard API is unavailable.
 * Does NOT: make API calls, manage auth state, or contain business logic.
 *
 * Usage: wrap a code or text element with <CopyButton text="..."> to make the
 * entire block clickable with a copy icon and "Copied!" confirmation.
 */

'use client';

import { useState, useCallback, type ReactNode } from 'react';

/**
 * Props for the CopyButton component.
 */
interface CopyButtonProps {
  /** The text to copy to the clipboard when clicked */
  text: string;
  /** Optional child content to display alongside the copy icon.
   *  If omitted, only the copy icon is shown. */
  children?: ReactNode;
  /** Additional CSS classes applied to the outer button element */
  className?: string;
  /**
   * Display style:
   *   "icon" — renders only the copy icon button (no wrapper box)
   *   "block" — renders a styled block containing children + icon (default)
   */
  variant?: 'icon' | 'block';
}

/**
 * Clickable copy-to-clipboard component.
 * Shows a clipboard icon. After clicking, shows a brief "Copied!" indicator.
 * Falls back silently if the Clipboard API is not available.
 *
 * @param props - Text to copy, optional children, and styling options
 * @returns A button or styled block that copies text on click
 */
export function CopyButton({ text, children, className = '', variant = 'block' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  /**
   * Copies `text` to the clipboard and shows the "Copied!" state for 1.5 seconds.
   * Uses the async Clipboard API; logs a warning on failure but never throws.
   */
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be blocked in some browsers — fail silently
      console.warn('[CopyButton] Clipboard write failed for text:', text.slice(0, 20));
    }
  }, [text]);

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={() => void handleCopy()}
        title={copied ? 'Copied!' : 'Copy to clipboard'}
        aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
        className={`inline-flex items-center rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
      >
        {copied ? (
          <svg
            className="h-4 w-4 text-emerald-500"
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
            className="h-4 w-4"
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
    );
  }

  // "block" variant: clickable area showing children + icon
  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      title={copied ? 'Copied!' : 'Click to copy'}
      aria-label={copied ? 'Copied to clipboard' : 'Click to copy to clipboard'}
      className={`group flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-transparent transition-colors hover:border-indigo-200 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
    >
      <span className="flex-1 text-left">{children}</span>
      <span
        className="shrink-0 text-xs font-medium transition-colors"
        aria-hidden="true"
      >
        {copied ? (
          <span className="flex items-center gap-1 text-emerald-600">
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Copied!
          </span>
        ) : (
          <span className="flex items-center gap-1 text-gray-400 group-hover:text-indigo-500">
            <svg
              className="h-3.5 w-3.5"
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
            Copy
          </span>
        )}
      </span>
    </button>
  );
}
