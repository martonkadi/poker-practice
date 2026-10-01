// Pure selector for the Review screen. No React and no engine imports, so the
// hidden-card rules can be tested without a browser and Review stays out of
// the engine chunk. Only types come from @poker/contracts.
import type { Action, Card, HandRecord, TableFrame } from '@poker/contracts';

export interface ReviewOutcome {
  /** Board cards dealt before the hand ended (never undealt cards). */
  finalBoard: Card[];
  /** Hero's net chips won (positive) or lost (negative). */
  heroNet: number;
  /** Bot hole cards, only when the hand reached showdown. */
  botHole: [Card, Card] | null;
}

export interface ReviewView {
  /** Hero's two hole cards at this decision. */
  heroHole: [Card, Card];
  /** Exactly the board cards in this decision's frame. */
  board: Card[];
  /** Decision-time public state (no bot cards, no later board, no result). */
  pot: number;
  heroStack: number;
  street: TableFrame['street'];
  actor: TableFrame['actor'];
  /** Price to call at this decision (0 when no call is required). */
  call: number;
  action: Action;
  amount: number;
  /** Null unless the outcome section is open. */
  outcome: ReviewOutcome | null;
}

/**
 * Builds what the Review screen may render for decision `index` of `record`.
 * With `outcomeOpen: false` nothing beyond decision-time information is returned.
 * Throws RangeError when `index` is not a valid decision index.
 */
export function reviewView(record: HandRecord, index: number, opts: { outcomeOpen: boolean }): ReviewView {
  const decision = Number.isInteger(index) ? record.decisions[index] : undefined;
  if (!decision) throw new RangeError(`No decision at index ${index}`);
  const f = decision.frame;
  const outcome: ReviewOutcome | null = opts.outcomeOpen
    ? {
        finalBoard: [...record.finalBoard],
        heroNet: record.heroNet,
        botHole: record.reachedShowdown && record.botHole ? [record.botHole[0], record.botHole[1]] : null,
      }
    : null;
  return {
    heroHole: [decision.heroHole[0], decision.heroHole[1]],
    board: [...f.board],
    pot: f.pot,
    heroStack: f.stacks.hero,
    street: f.street,
    actor: f.actor,
    call: f.legal?.call ?? 0,
    action: decision.action,
    amount: decision.amount,
    outcome,
  };
}
