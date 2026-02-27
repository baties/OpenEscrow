/**
 * LoadingSpinner.tsx — OpenEscrow Web Dashboard
 *
 * Reusable accessible loading spinner component.
 * Handles: rendering an animated SVG spinner with an accessible label.
 * Does NOT: manage any state, make API calls, or handle business logic.
 */

/**
 * Props for the LoadingSpinner component.
 */
interface LoadingSpinnerProps {
  /** Screen-reader label for the spinner (default: "Loading...") */
  label?: string;
  /** Size variant (default: "md") */
  size?: 'sm' | 'md' | 'lg';
  /** Optional additional CSS classes */
  className?: string;
}

const sizeClasses: Record<string, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-10 w-10',
};

/**
 * Renders an animated loading spinner with an accessible aria-label.
 *
 * @param props - Label, size variant, and optional extra classes
 * @returns An SVG spinner wrapped in a span with role="status"
 */
export function LoadingSpinner({
  label = 'Loading...',
  size = 'md',
  className = '',
}: LoadingSpinnerProps) {
  return (
    <span role="status" className={`inline-flex items-center justify-center ${className}`}>
      <svg
        className={`animate-spin text-indigo-500 ${sizeClasses[size] ?? sizeClasses['md']}`}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
