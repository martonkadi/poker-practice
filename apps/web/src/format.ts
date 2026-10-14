import type { Action } from '@poker/contracts';

export type ChipUnit = 'chips' | 'bb';

/** Label for a saved action, shared by the Play action list and Review. */
export function displayAction(action: Action, amount: number, unit?: ChipUnit): string {
  const format = (chips: number) => unit ? formatBet(chips, unit) : chips.toLocaleString();
  if (action.kind === 'raiseTo') return `Bet / raise to ${format(action.amount)}`;
  if (action.kind === 'call') return `Call ${format(amount)}`;
  return action.kind[0]!.toUpperCase() + action.kind.slice(1);
}

// Local copy of the big blind size. Kept here (not imported from @poker/poker)
// so this module stays dependency-free and out of the engine chunk.
const BIG_BLIND = 100;

export function betInput(chips: number, unit: ChipUnit): string {
  return unit === 'bb' ? (chips / BIG_BLIND).toFixed(2).replace(/0$/, '').replace(/\.0$/, '') : String(chips);
}
export function parseBet(draft: string, unit: ChipUnit): number | null {
  if (!(unit === 'bb' ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/).test(draft)) return null;
  const [whole, fraction = ''] = draft.split('.');
  const chips = unit === 'bb' ? Number(whole) * BIG_BLIND + Number(fraction.padEnd(2, '0')) : Number(whole);
  return Number.isSafeInteger(chips) ? chips : null;
}
/** Bets retain every chip; stacks and results use the rounded amount formatter below. */
export function formatBet(chips: number, unit: ChipUnit): string {
  return unit === 'bb' ? `${(chips / BIG_BLIND).toFixed(2).replace(/0$/, '')} bb` : `${chips.toLocaleString('en-US')} chips`;
}

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
