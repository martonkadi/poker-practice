import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { handRecordSchema, type Card, type DecisionRecord, type HandRecord, type TableFrame } from '@poker/contracts';
import { reviewView } from './reviewView';

const frame = (street: TableFrame['street'], board: number[]): TableFrame => ({
  street, board, pot: 300, stacks: { hero: 9_850, bot: 9_850 }, commitments: { hero: 0, bot: 0 }, actor: 'hero',
  legal: { fold: true, check: false, call: 100, raise: { min: 400, max: 9_950 }, allInTo: 9_950 }
});
const decision = (street: TableFrame['street'], board: number[]): DecisionRecord =>
  ({ frame: frame(street, board), action: { kind: 'call' }, amount: 100, heroHole: [0, 1] });

function record(overrides: Partial<HandRecord>): HandRecord {
  return {
    schemaVersion: 1, engineVersion: 'test', botVersion: 'standard-v1',
    id: '00000000-0000-4000-8000-000000000001', sessionId: '00000000-0000-4000-8000-000000000002',
    sessionStartedAt: '2024-01-01T00:00:00.000Z', sequence: 0, completedAt: '2024-01-01T00:01:00.000Z',
    button: 'hero', difficulty: 'standard', initialHeroHole: [0, 1], botHole: [2, 3],
    finalBoard: [10, 11, 12, 13, 14],
    decisions: [decision('preflop', []), decision('flop', [10, 11, 12]), decision('river', [10, 11, 12, 13, 14])],
    heroNet: 500, reachedShowdown: true, heroWonShowdown: true, bookmarked: false,
    ...overrides
  };
}

describe('reviewView', () => {
  it('shows only decision-time cards while the outcome is collapsed', () => {
    const v = reviewView(record({}), 1, { outcomeOpen: false });
    expect(v.heroHole).toEqual([0, 1]);
    expect(v.board).toEqual([10, 11, 12]);
    expect(v.outcome).toBeNull();
    expect(JSON.stringify(v)).not.toContain('"botHole"');
  });

  it('adds final board, net result and bot cards when open at showdown', () => {
    const v = reviewView(record({}), 0, { outcomeOpen: true });
    expect(v.board).toEqual([]);
    expect(v.outcome).toEqual({ finalBoard: [10, 11, 12, 13, 14], heroNet: 500, botHole: [2, 3] });
  });

  it('never shows bot cards for a hand that ended by a fold', () => {
    const folded = record({ reachedShowdown: false, heroWonShowdown: false, finalBoard: [10, 11, 12], heroNet: -100,
      decisions: [decision('preflop', []), decision('flop', [10, 11, 12])] });
    expect(reviewView(folded, 1, { outcomeOpen: true }).outcome).toEqual({ finalBoard: [10, 11, 12], heroNet: -100, botHole: null });
  });

  it('rejects an index with no decision', () => {
    expect(() => reviewView(record({}), 3, { outcomeOpen: false })).toThrow(RangeError);
  });
});

// Property: Review view shows only decision-time cards
describe('reviewView property', () => {
  const STREETS = ['preflop', 'flop', 'turn', 'river'] as const;
  const BOARD_LENGTH = [0, 3, 4, 5] as const;
  const VIEW_KEYS = ['action', 'actor', 'amount', 'board', 'call', 'heroHole', 'heroStack', 'outcome', 'pot', 'street'];

  const arbAction = fc.oneof(
    fc.constant({ kind: 'fold' as const }), fc.constant({ kind: 'check' as const }), fc.constant({ kind: 'call' as const }),
    fc.integer({ min: 200, max: 10_000 }).map((amount) => ({ kind: 'raiseTo' as const, amount }))
  );
  const arbLegal = fc.option(fc.record({
    fold: fc.boolean(), check: fc.boolean(), call: fc.option(fc.integer({ min: 1, max: 10_000 })),
    raise: fc.option(fc.record({ min: fc.integer({ min: 200, max: 400 }), max: fc.integer({ min: 400, max: 10_000 }) })),
    allInTo: fc.option(fc.integer({ min: 1, max: 10_000 }))
  }));

  /** A deck slice: hero hole (0–1), bot hole (2–3), five board cards (4–8). Unused board cards are undealt. */
  const arbHand = fc.record({
    cards: fc.shuffledSubarray([...Array(52).keys()], { minLength: 9, maxLength: 9 }),
    reachedShowdown: fc.boolean(),
    lastStreet: fc.integer({ min: 0, max: 3 }),
    storeBotHoleOnFold: fc.boolean(),
    heroWonShowdown: fc.boolean(),
    heroNet: fc.integer({ min: -10_000, max: 10_000 }),
    button: fc.constantFrom('hero' as const, 'bot' as const)
  }).chain((base) => {
    const last = base.reachedShowdown ? 3 : base.lastStreet;
    const arbDecision = fc.record({
      streetIndex: fc.integer({ min: 0, max: last }),
      action: arbAction,
      amount: fc.integer({ min: 0, max: 10_000 }),
      pot: fc.integer({ min: 150, max: 20_000 }),
      heroStack: fc.integer({ min: 0, max: 10_000 }),
      actor: fc.constantFrom('hero' as const, 'bot' as const),
      legal: arbLegal
    });
    return fc.record({ base: fc.constant({ ...base, last }), decisions: fc.array(arbDecision, { minLength: 1, maxLength: 12 }) });
  }).map(({ base, decisions }) => {
    const heroHole: [Card, Card] = [base.cards[0], base.cards[1]];
    const botCards: [Card, Card] = [base.cards[2], base.cards[3]];
    const finalBoard = base.cards.slice(4, 4 + BOARD_LENGTH[base.last]);
    const undealt = base.cards.slice(4 + finalBoard.length);
    const sorted = [...decisions].sort((a, b) => a.streetIndex - b.streetIndex);
    const record: HandRecord = {
      schemaVersion: 1, engineVersion: 'test', botVersion: 'standard-v1',
      id: '00000000-0000-4000-8000-000000000001', sessionId: '00000000-0000-4000-8000-000000000002',
      sessionStartedAt: '2024-01-01T00:00:00.000Z', sequence: 0, completedAt: '2024-01-01T00:01:00.000Z',
      button: base.button, difficulty: 'standard', initialHeroHole: heroHole,
      // A fold hand may still carry stored bot cards; the selector must hide them.
      botHole: base.reachedShowdown || base.storeBotHoleOnFold ? botCards : null,
      finalBoard,
      decisions: sorted.map((d): DecisionRecord => ({
        frame: {
          street: STREETS[d.streetIndex], board: finalBoard.slice(0, BOARD_LENGTH[d.streetIndex]), pot: d.pot,
          stacks: { hero: d.heroStack, bot: Math.max(0, 20_000 - d.pot - d.heroStack) },
          commitments: { hero: 0, bot: 0 }, actor: d.actor, legal: d.legal
        },
        action: d.action, amount: d.amount, heroHole: [heroHole[0], heroHole[1]]
      })),
      heroNet: base.heroNet, reachedShowdown: base.reachedShowdown,
      heroWonShowdown: base.reachedShowdown && base.heroWonShowdown, bookmarked: false
    };
    return { record, botCards, undealt };
  });

  const arbCase = arbHand.chain((hand) =>
    fc.record({ hand: fc.constant(hand), index: fc.integer({ min: 0, max: hand.record.decisions.length - 1 }) }));

  it('collapsed view shows only decision-time cards; open view adds outcome and showdown-only bot cards', () => {
    fc.assert(fc.property(arbCase, ({ hand: { record, botCards, undealt }, index }) => {
      expect(handRecordSchema.safeParse(record).success).toBe(true);
      const decision = record.decisions[index];
      const streetIndex = STREETS.indexOf(decision.frame.street as (typeof STREETS)[number]);

      const closed = reviewView(record, index, { outcomeOpen: false });
      expect(Object.keys(closed).sort()).toEqual(VIEW_KEYS);
      expect(closed.heroHole).toEqual(record.initialHeroHole);
      expect(closed.board).toEqual(decision.frame.board);
      expect(closed.board).toHaveLength(BOARD_LENGTH[streetIndex]);
      expect(closed.outcome).toBeNull();
      const closedCards = [...closed.heroHole, ...closed.board];
      const laterBoard = record.finalBoard.slice(closed.board.length);
      for (const hidden of [...botCards, ...laterBoard, ...undealt]) expect(closedCards).not.toContain(hidden);

      const open = reviewView(record, index, { outcomeOpen: true });
      expect({ ...open, outcome: null }).toEqual(closed);
      expect(open.outcome?.finalBoard).toEqual(record.finalBoard);
      expect(open.outcome?.heroNet).toBe(record.heroNet);
      if (record.reachedShowdown) expect(open.outcome?.botHole).toEqual(botCards);
      else expect(open.outcome?.botHole).toBeNull();
      const openCards = [...open.heroHole, ...open.board, ...(open.outcome?.finalBoard ?? []), ...(open.outcome?.botHole ?? [])];
      for (const hidden of undealt) expect(openCards).not.toContain(hidden);
      if (!record.reachedShowdown) for (const hidden of botCards) expect(openCards).not.toContain(hidden);
    }), { numRuns: 200 });
  });
});
