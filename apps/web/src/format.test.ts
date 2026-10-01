import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatAmount } from './format';

const MINUS = '\u2212';

const signPrefix = (n: number): string => (n > 0 ? '+' : n < 0 ? MINUS : '');

describe('formatAmount', () => {
  it('formats signed examples in chips and bb', () => {
    expect(formatAmount(0, 'chips', { signed: true })).toBe('0 chips');
    expect(formatAmount(0, 'bb', { signed: true })).toBe('0.0 bb');
    expect(formatAmount(1250, 'chips', { signed: true })).toBe('+1,250 chips');
    expect(formatAmount(1250, 'bb', { signed: true })).toBe('+12.5 bb');
    expect(formatAmount(-1250, 'chips', { signed: true })).toBe(`${MINUS}1,250 chips`);
    expect(formatAmount(-1250, 'bb', { signed: true })).toBe(`${MINUS}12.5 bb`);
    // Sign follows the raw chip value even when the rounded body is 0.0.
    expect(formatAmount(5, 'bb', { signed: true })).toBe('+0.1 bb');
    expect(formatAmount(-4, 'bb', { signed: true })).toBe(`${MINUS}0.0 bb`);
  });

  // Feature: guest-mvp-release, Property 11: Formatter consistency
  // **Validates: Requirements 7.1, 7.2, 7.4**
  it('Property 11: signed chips and bb strings follow the spec format', () => {
    fc.assert(
      fc.property(fc.integer({ min: -20_000, max: 20_000 }), (n) => {
        const abs = Math.abs(n);
        const prefix = signPrefix(n);
        expect(formatAmount(n, 'chips', { signed: true })).toBe(
          `${prefix}${abs.toLocaleString('en-US')} chips`,
        );
        expect(formatAmount(n, 'bb', { signed: true })).toBe(
          `${prefix}${(abs / 100).toFixed(1)} bb`,
        );
      }),
      { numRuns: 100 },
    );
  });
});
