/**
 * format.test.ts — OpenEscrow Web Dashboard Tests
 *
 * Unit tests for the format utility functions.
 * Handles: testing token amount formatting, address truncation, status label/colors.
 * Does NOT: test React components, make API calls, or test async behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  formatTokenAmount,
  parseTokenAmount,
  truncateAddress,
  formatStatus,
  getStatusBadgeClasses,
} from '../src/lib/format';

describe('formatTokenAmount', () => {
  it('formats 1 USDC (1000000 raw) as "1.00"', () => {
    expect(formatTokenAmount('1000000')).toBe('1.00');
  });

  it('formats 0 as "0.00"', () => {
    expect(formatTokenAmount('0')).toBe('0.00');
  });

  it('formats 500000 (0.50 USDC) as "0.50"', () => {
    expect(formatTokenAmount('500000')).toBe('0.50');
  });

  it('formats large amounts with commas', () => {
    // 1,000 USDC
    expect(formatTokenAmount('1000000000')).toBe('1,000.00');
  });

  it('returns "0.00" for invalid input', () => {
    expect(formatTokenAmount('not-a-number')).toBe('0.00');
  });

  it('respects custom decimal places', () => {
    expect(formatTokenAmount('1500000', 0)).toBe('2');
    expect(formatTokenAmount('1500000', 4)).toBe('1.5000');
  });
});

describe('parseTokenAmount', () => {
  it('converts "1.00" to "1000000"', () => {
    expect(parseTokenAmount('1.00')).toBe('1000000');
  });

  it('converts "0.50" to "500000"', () => {
    expect(parseTokenAmount('0.50')).toBe('500000');
  });

  it('converts "1000" to "1000000000"', () => {
    expect(parseTokenAmount('1000')).toBe('1000000000');
  });

  it('handles fractional amounts correctly', () => {
    expect(parseTokenAmount('1.123456')).toBe('1123456');
  });

  it('throws for negative amounts', () => {
    expect(() => parseTokenAmount('-1')).toThrow();
  });

  it('throws for non-numeric input', () => {
    expect(() => parseTokenAmount('abc')).toThrow();
  });
});

describe('truncateAddress', () => {
  const address = '0x1234567890abcdef1234567890abcdef12345678';

  it('truncates a full address with default settings', () => {
    expect(truncateAddress(address)).toBe('0x1234...5678');
  });

  it('respects custom prefix length', () => {
    expect(truncateAddress(address, 6, 4)).toBe('0x123456...5678');
  });

  it('returns short addresses unchanged', () => {
    expect(truncateAddress('0x1234')).toBe('0x1234');
  });

  it('returns empty string for empty input', () => {
    expect(truncateAddress('')).toBe('');
  });
});

describe('formatStatus', () => {
  it('formats DRAFT as "Draft"', () => {
    expect(formatStatus('DRAFT')).toBe('Draft');
  });

  it('formats REVISION as "In Revision"', () => {
    expect(formatStatus('REVISION')).toBe('In Revision');
  });

  it('formats COMPLETED as "Completed"', () => {
    expect(formatStatus('COMPLETED')).toBe('Completed');
  });

  it('returns unknown statuses as-is', () => {
    expect(formatStatus('UNKNOWN_STATUS')).toBe('UNKNOWN_STATUS');
  });
});

describe('getStatusBadgeClasses', () => {
  it('returns green classes for APPROVED', () => {
    const classes = getStatusBadgeClasses('APPROVED');
    expect(classes).toContain('green');
  });

  it('returns red classes for REJECTED', () => {
    const classes = getStatusBadgeClasses('REJECTED');
    expect(classes).toContain('red');
  });

  it('returns emerald classes for COMPLETED', () => {
    const classes = getStatusBadgeClasses('COMPLETED');
    expect(classes).toContain('emerald');
  });

  it('returns fallback classes for unknown status', () => {
    const classes = getStatusBadgeClasses('UNKNOWN');
    expect(classes).toBeDefined();
    expect(typeof classes).toBe('string');
  });
});
