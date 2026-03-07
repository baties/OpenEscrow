/**
 * schemas.test.ts — OpenEscrow Web Dashboard Tests
 *
 * Unit tests for Zod validation schemas.
 * Handles: testing valid inputs pass validation, invalid inputs fail with the
 *          correct error messages, edge cases.
 * Does NOT: test React components, make API calls, or test async behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  createDealSchema,
  submitMilestoneSchema,
  rejectMilestoneSchema,
  telegramLinkSchema,
  fundDealSchema,
  milestoneInputSchema,
} from '../src/lib/schemas';

// ─── milestoneInputSchema ──────────────────────────────────────────────────────

describe('milestoneInputSchema', () => {
  const valid = {
    title: 'Design mockups',
    description: 'Create all UI mockups for the dashboard',
    acceptanceCriteria: 'All screens completed per spec',
    amount: '500.00',
  };

  it('accepts a valid milestone input', () => {
    expect(() => milestoneInputSchema.parse(valid)).not.toThrow();
  });

  it('rejects a title that is too short', () => {
    const result = milestoneInputSchema.safeParse({ ...valid, title: 'ab' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('3 characters');
    }
  });

  it('rejects a negative amount', () => {
    const result = milestoneInputSchema.safeParse({ ...valid, amount: '-100' });
    expect(result.success).toBe(false);
  });

  it('rejects an amount with more than 6 decimal places', () => {
    const result = milestoneInputSchema.safeParse({ ...valid, amount: '1.1234567' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('6 decimal');
    }
  });

  it('accepts an amount with exactly 6 decimal places', () => {
    expect(() => milestoneInputSchema.parse({ ...valid, amount: '1.123456' })).not.toThrow();
  });
});

// ─── createDealSchema ──────────────────────────────────────────────────────────

describe('createDealSchema', () => {
  const validMilestone = {
    title: 'Design mockups',
    description: 'Create all UI mockups for the dashboard',
    acceptanceCriteria: 'All screens completed per spec',
    amount: '500.00',
  };

  const validDeal = {
    freelancerAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    tokenAddress: '0x1234567890123456789012345678901234567890',
    milestones: [validMilestone],
  };

  it('accepts a valid deal with one milestone', () => {
    expect(() => createDealSchema.parse(validDeal)).not.toThrow();
  });

  it('rejects an invalid freelancer address (no 0x prefix)', () => {
    const result = createDealSchema.safeParse({
      ...validDeal,
      freelancerAddress: 'notanaddress',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty milestones array', () => {
    const result = createDealSchema.safeParse({ ...validDeal, milestones: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('at least one milestone');
    }
  });

  it('rejects more than 20 milestones', () => {
    const milestones = Array.from({ length: 21 }, () => validMilestone);
    const result = createDealSchema.safeParse({ ...validDeal, milestones });
    expect(result.success).toBe(false);
  });

  it('accepts exactly 20 milestones', () => {
    const milestones = Array.from({ length: 20 }, () => validMilestone);
    expect(() => createDealSchema.parse({ ...validDeal, milestones })).not.toThrow();
  });
});

// ─── submitMilestoneSchema ─────────────────────────────────────────────────────

describe('submitMilestoneSchema', () => {
  it('accepts valid submission with summary and links', () => {
    expect(() =>
      submitMilestoneSchema.parse({
        summary: 'Completed all the work as specified in the criteria',
        links: ['https://github.com/example/repo'],
      })
    ).not.toThrow();
  });

  it('accepts empty links array (optional)', () => {
    expect(() =>
      submitMilestoneSchema.parse({
        summary: 'Completed all the work as specified',
        links: [],
      })
    ).not.toThrow();
  });

  it('rejects a summary that is too short', () => {
    const result = submitMilestoneSchema.safeParse({ summary: 'Too short', links: [] });
    expect(result.success).toBe(false);
  });

  it('rejects invalid URLs in links', () => {
    const result = submitMilestoneSchema.safeParse({
      summary: 'Completed all the work as specified in the criteria',
      links: ['not-a-url'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 10 links', () => {
    const links = Array.from({ length: 11 }, (_, i) => `https://example.com/${i}`);
    const result = submitMilestoneSchema.safeParse({
      summary: 'Completed all the work as specified in the criteria',
      links,
    });
    expect(result.success).toBe(false);
  });
});

// ─── rejectMilestoneSchema ─────────────────────────────────────────────────────

describe('rejectMilestoneSchema', () => {
  it('accepts valid rejection with at least one reason code', () => {
    expect(() =>
      rejectMilestoneSchema.parse({
        reasonCodes: ['INCOMPLETE_DELIVERABLE'],
        freeText: '',
      })
    ).not.toThrow();
  });

  it('rejects empty reasonCodes array', () => {
    const result = rejectMilestoneSchema.safeParse({ reasonCodes: [], freeText: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('at least one');
    }
  });

  it('rejects invalid reason codes', () => {
    const result = rejectMilestoneSchema.safeParse({
      reasonCodes: ['INVALID_REASON_CODE'],
      freeText: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts multiple valid reason codes', () => {
    expect(() =>
      rejectMilestoneSchema.parse({
        reasonCodes: ['INCOMPLETE_DELIVERABLE', 'BUG_OR_ERROR'],
        freeText: 'Details here',
      })
    ).not.toThrow();
  });
});

// ─── telegramLinkSchema ────────────────────────────────────────────────────────

describe('telegramLinkSchema', () => {
  const validPayload = { code: 'ABC123def', telegramUserId: '123456789' };

  it('accepts a valid alphanumeric code with numeric telegramUserId', () => {
    expect(() => telegramLinkSchema.parse(validPayload)).not.toThrow();
  });

  it('rejects a code that is too short', () => {
    const result = telegramLinkSchema.safeParse({ ...validPayload, code: 'abc' });
    expect(result.success).toBe(false);
  });

  it('rejects a code with special characters', () => {
    const result = telegramLinkSchema.safeParse({ ...validPayload, code: 'abc-123' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('alphanumeric');
    }
  });

  it('trims whitespace before validation', () => {
    expect(() =>
      telegramLinkSchema.parse({ code: '  ABC123def  ', telegramUserId: '123456789' })
    ).not.toThrow();
  });

  it('rejects non-numeric telegramUserId', () => {
    const result = telegramLinkSchema.safeParse({
      code: 'ABC123def',
      telegramUserId: 'notanumber',
    });
    expect(result.success).toBe(false);
  });
});

// ─── fundDealSchema ────────────────────────────────────────────────────────────

describe('fundDealSchema', () => {
  const validTxHash = '0x' + 'a'.repeat(64);

  it('accepts a valid 66-char hex transaction hash', () => {
    expect(() => fundDealSchema.parse({ txHash: validTxHash })).not.toThrow();
  });

  it('rejects a hash without 0x prefix', () => {
    const result = fundDealSchema.safeParse({ txHash: 'a'.repeat(64) });
    expect(result.success).toBe(false);
  });

  it('rejects a hash that is too short', () => {
    const result = fundDealSchema.safeParse({ txHash: '0x' + 'a'.repeat(63) });
    expect(result.success).toBe(false);
  });

  it('rejects a hash with non-hex characters', () => {
    const result = fundDealSchema.safeParse({ txHash: '0x' + 'z'.repeat(64) });
    expect(result.success).toBe(false);
  });
});
