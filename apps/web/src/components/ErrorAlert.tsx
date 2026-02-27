/**
 * ErrorAlert.tsx — OpenEscrow Web Dashboard
 *
 * Reusable error alert banner component for displaying user-visible errors.
 * Handles: rendering an error message with an optional dismiss button.
 * Does NOT: manage error state, make API calls, or handle any business logic.
 */

/**
 * Props for the ErrorAlert component.
 */
interface ErrorAlertProps {
  /** The error message to display. Renders nothing if null or empty. */
  message: string | null | undefined;
  /** Optional callback invoked when the user dismisses the alert */
  onDismiss?: () => void;
  /** Optional additional CSS classes for the container */
  className?: string;
}

/**
 * Renders a dismissible red alert banner for error messages.
 * Returns null if message is empty or null — safe to always render in JSX.
 *
 * @param props - Message, optional dismiss handler, and extra classes
 * @returns A styled error banner, or null if no message
 */
export function ErrorAlert({ message, onDismiss, className = '' }: ErrorAlertProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 ${className}`}
    >
      <svg
        className="mt-0.5 h-4 w-4 shrink-0 text-red-500"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.707-4.293a1 1 0 001.414 0L10 13.414l-.293.293a1 1 0 001.414-1.414L11.414 12l.293-.293a1 1 0 00-1.414-1.414L10 10.586l-.293-.293a1 1 0 00-1.414 1.414L8.586 12l-.293.293a1 1 0 101.414 1.414L10 13.414l.293.293a1 1 0 001.414-1.414L11.414 12l.293.293z"
          clipRule="evenodd"
        />
      </svg>
      <p className="flex-1">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto shrink-0 text-red-400 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 rounded"
          aria-label="Dismiss error"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
