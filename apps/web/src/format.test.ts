import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { betInput, displayAction, formatAmount, formatBet, parseBet } from './format';

const MINUS = '\u2212';

const signPrefix = (n: number): string => (n > 0 ? '+' : n < 0 ? MINUS : '');

it('parses exact bets and rejects drafts that cannot represent whole chips', () => {
  expect(parseBet('2.01', 'bb')).toBe(201);
  expect(parseBet('0.29', 'bb')).toBe(29);
  for (const draft of ['', '-2', '2.', '.5', '2.001', '1e2', 'Infinity', ' 2']) expect(parseBet(draft, 'bb')).toBeNull();
  expect(parseBet('201.1', 'chips')).toBeNull();
  expect(parseBet('9007199254740992', 'chips')).toBeNull();
  fc.assert(fc.property(fc.integer({ min: 0, max: 20_000 }), chips => {
    expect(parseBet(betInput(chips, 'bb'), 'bb')).toBe(chips);
    expect(parseBet(betInput(chips, 'chips'), 'chips')).toBe(chips);
  }));
  expect(formatBet(201, 'bb')).toBe('2.01 bb');
  expect(displayAction({ kind: 'call' }, 50, 'bb')).toBe('Call 0.5 bb');
  expect(displayAction({ kind: 'raiseTo', amount: 201 }, 151, 'bb')).toBe('Bet / raise to 2.01 bb');
  expect(displayAction({ kind: 'raiseTo', amount: 201 }, 151)).toBe('Bet / raise to 201');
});

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

  // Property: Formatter consistency
  // **Validates: Requirements 7.1, 7.2, 7.4**
  it('signed chips and bb strings follow the spec format', () => {
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
