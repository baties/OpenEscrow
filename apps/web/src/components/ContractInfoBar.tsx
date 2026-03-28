/**
 * ContractInfoBar.tsx — OpenEscrow Web Dashboard
 *
 * Thin info bar displayed below the Navbar showing the active chain and
 * the deployed contract address as a clickable link to the block explorer.
 * Handles: rendering chain badge, truncated contract address, external link.
 * Does NOT: make API calls, manage state, or render when contract is undeployed.
 *
 * Clicking the address opens the explorer's contract page in a new tab so users
 * can verify transactions directly from the dashboard.
 */

import { appConfig } from '@/lib/config';

/** Zero address — used to detect a not-yet-deployed contract. */
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Shortens an EVM address to "0xABCD…1234" format for compact display.
 *
 * @param address - Full EVM address string.
 * @returns Truncated address string.
 */
function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Renders a thin info bar with the active chain name and a link to the contract
 * on the chain's block explorer.
 * Returns null if the contract address is the zero address (not yet deployed).
 *
 * @returns JSX.Element | null — the info bar, or null if contract not deployed
 */
export function ContractInfoBar() {
  const { contractAddress, chainMeta } = appConfig;

  // Don't render if the contract isn't deployed (placeholder zero address).
  if (contractAddress === ZERO_ADDRESS) return null;

  const explorerUrl = `${chainMeta.explorerUrl}/address/${contractAddress}`;

  return (
    <div className="border-b border-gray-100 bg-gray-50 px-4 py-1.5 sm:px-6">
      <div className="mx-auto flex max-w-7xl items-center gap-3 text-xs text-gray-500">
        {/* Chain badge */}
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
            chainMeta.isTestnet
              ? 'bg-amber-100 text-amber-700'
              : 'bg-green-100 text-green-700'
          }`}
        >
          {chainMeta.shortName}
          {chainMeta.isTestnet && ' testnet'}
        </span>

        {/* Contract address link */}
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`View contract on ${chainMeta.name} explorer: ${contractAddress}`}
          className="flex items-center gap-1 font-mono transition-colors hover:text-indigo-600"
        >
          Contract: {shortAddress(contractAddress)}
          {/* External link icon */}
          <svg
            className="h-3 w-3 shrink-0"
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
      </div>
    </div>
  );
}
