import type { Action } from '@poker/contracts';

export type ChipUnit = 'chips' | 'bb';

/** Label for a saved action, shared by the Play action list and Review. */
export function displayAction(action: Action, amount: number): string {
  if (action.kind === 'raiseTo') return `Bet / raise to ${action.amount.toLocaleString()}`;
  if (action.kind === 'call') return `Call ${amount.toLocaleString()}`;
  return action.kind[0]!.toUpperCase() + action.kind.slice(1);
}

// Local copy of the big blind size. Kept here (not imported from @poker/poker)
// so this module stays dependency-free and out of the engine chunk.
const BIG_BLIND = 100;

/** U+2212 MINUS SIGN, used instead of the ASCII hyphen for negative amounts. */
const MINUS = '\u2212';

/**
 * Formats a chip amount for display.
 *
 * - `chips`: whole number in en-US grouping, e.g. "1,250 chips".
 * - `bb`: |chips| / BIG_BLIND to one decimal, e.g. "12.5 bb".
 *
 * Sign handling (sign always follows the raw chip value, not the rounded output):
 * - `signed: true`: "+" if chips > 0, "−" if chips < 0, no prefix at 0.
 * - not signed: no "+" for positives, but negatives still get "−" so the
 *   information is not lost.
 */
export function formatAmount(
  chips: number,
  unit: ChipUnit,
  opts?: { signed?: boolean },
): string {
  const abs = Math.abs(chips);
  const body =
    unit === 'bb'
      ? // toFixed(1) per spec (Property 11); toLocaleString rounds differently
        // for binary-inexact halves such as 0.15.
        `${(abs / BIG_BLIND).toFixed(1)} bb`
      : `${Math.round(abs).toLocaleString('en-US', { maximumFractionDigits: 0 })} chips`;

  let prefix = '';
  if (chips < 0) prefix = MINUS;
  else if (chips > 0 && opts?.signed) prefix = '+';
  return prefix + body;
}
