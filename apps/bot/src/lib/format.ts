/**
 * lib/format.ts — OpenEscrow Telegram Bot
 *
 * Handles: Display formatting utilities for bot messages.
 *          formatTokenAmount — converts BigInt string amounts to human-readable token values.
 * Does NOT: make API calls, access env directly, or manage state.
 */

import { env } from '../config/env.js';

/**
 * Converts a raw ERC-20 token amount (as a BigInt string) to a human-readable display string.
 * USDC and USDT always use 6 decimal places on EVM chains.
 * The token symbol is derived from the token address matched against USDC_ADDRESS / USDT_ADDRESS.
 *
 * @param rawAmount - Token amount as a BigInt string (e.g. "12000000" = 12.00 USDC)
 * @param tokenAddress - ERC-20 contract address (lowercase) of the token
 * @returns Formatted string like "12.00 USDC" or "12.00 USDT" or "12.00 tokens"
 */
export function formatTokenAmount(rawAmount: string, tokenAddress: string): string {
  const TOKEN_DECIMALS = 6; // USDC and USDT always use 6 decimals on EVM

  let formatted: string;
  try {
    const raw = BigInt(rawAmount);
    const divisor = BigInt(10 ** TOKEN_DECIMALS);
    const whole = raw / divisor;
    const fractional = raw % divisor;
    // Pad fractional part to 6 digits then trim trailing zeros (show min 2 decimal places)
    const fracStr = fractional.toString().padStart(TOKEN_DECIMALS, '0');
    const trimmed = fracStr.replace(/0+$/, '').padEnd(2, '0');
    formatted = `${whole}.${trimmed}`;
  } catch {
    // Fallback if BigInt conversion fails (should never happen with valid API data)
    formatted = rawAmount;
  }

  const addr = tokenAddress.toLowerCase();
  const usdcAddr = env.USDC_ADDRESS.toLowerCase();
  const usdtAddr = env.USDT_ADDRESS.toLowerCase();
  let symbol = 'tokens';

  if (usdcAddr && addr === usdcAddr) {
    symbol = 'USDC';
  } else if (usdtAddr && addr === usdtAddr) {
    symbol = 'USDT';
  }

  return `${formatted} ${symbol}`;
}
