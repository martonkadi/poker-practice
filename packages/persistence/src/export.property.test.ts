import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { handRecordSchema } from '@poker/contracts';
import type { Actor, Card, DecisionRecord, HandRecord, LegalActionSet, Street } from '@poker/contracts';
import { createHand } from '@poker/poker';
import { deleteLocal, exportHands, GUEST_OWNER, listHands, saveCompleted, type ActiveSession } from './index';

const STREET_BOARD: Record<Exclude<Street, 'settled'>, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
const MIN_TIME = Date.parse('2026-01-01T00:00:00.000Z');
const MAX_TIME = Date.parse('2026-12-31T23:59:59.999Z');

const actorArb = fc.constantFrom<Actor>('hero', 'bot');
const chips = fc.integer({ min: 0, max: 20_000 });
const legalArb: fc.Arbitrary<LegalActionSet | null> = fc.option(fc.record({
  fold: fc.boolean(), check: fc.boolean(), call: fc.option(chips, { nil: null }),
  raise: fc.option(fc.record({ min: chips, max: chips }), { nil: null }), allInTo: fc.option(chips, { nil: null })
}), { nil: null });
const actionArb = fc.oneof(
  fc.constant({ kind: 'fold' as const }), fc.constant({ kind: 'check' as const }), fc.constant({ kind: 'call' as const }),
  chips.map(amount => ({ kind: 'raiseTo' as const, amount }))
);

/** A valid Hand_Record: distinct cards, consistent showdown flags, start before completion, decision boards from the final board. */
const handArb: fc.Arbitrary<HandRecord> = fc.record({
  cards: fc.shuffledSubarray(Array.from({ length: 52 }, (_, i) => i), { minLength: 9, maxLength: 9 }),
  reachedShowdown: fc.boolean(), heroWon: fc.boolean(), foldBoardLength: fc.constantFrom(0, 3, 4, 5),
  start: fc.integer({ min: MIN_TIME, max: MAX_TIME }), duration: fc.integer({ min: 0, max: 3_600_000 }),
  id: fc.uuid(), sessionId: fc.uuid(), sequence: fc.nat({ max: 10_000 }), button: actorArb,
  botVersion: fc.constantFrom<HandRecord['botVersion']>('standard-v1', 'easy-v1'),
  difficulty: fc.constantFrom<HandRecord['difficulty']>('standard', 'easy'),
  heroNet: fc.integer({ min: -10_000, max: 10_000 }), bookmarked: fc.boolean(),
  decisions: fc.array(fc.record({
    street: fc.constantFrom<Exclude<Street, 'settled'>>('preflop', 'flop', 'turn', 'river'),
    pot: chips, stacks: fc.record({ hero: chips, bot: chips }), commitments: fc.record({ hero: chips, bot: chips }),
    actor: fc.option(actorArb, { nil: null }), legal: legalArb, action: actionArb, amount: chips
  }), { maxLength: 12 })
}).map(g => {
  const initialHeroHole: [Card, Card] = [g.cards[0]!, g.cards[1]!];
  const botHole: [Card, Card] | null = g.reachedShowdown ? [g.cards[2]!, g.cards[3]!] : null;
  const finalBoard = g.cards.slice(4, 4 + (g.reachedShowdown ? 5 : g.foldBoardLength));
  const decisions: DecisionRecord[] = g.decisions.map(d => {
    const board = g.cards.slice(4, 4 + STREET_BOARD[d.street]);
    return { frame: { street: d.street, board, pot: d.pot, stacks: d.stacks, commitments: d.commitments, actor: d.actor, legal: d.legal },
      action: d.action, amount: d.amount, heroHole: initialHeroHole };
  });
  return { schemaVersion: 1, engineVersion: 'property-fixture', botVersion: g.botVersion, id: g.id, sessionId: g.sessionId,
    sessionStartedAt: new Date(g.start).toISOString(), sequence: g.sequence, completedAt: new Date(g.start + g.duration).toISOString(),
    button: g.button, difficulty: g.difficulty, initialHeroHole, botHole, finalBoard, decisions, heroNet: g.heroNet,
    reachedShowdown: g.reachedShowdown, heroWonShowdown: g.reachedShowdown && g.heroWon, bookmarked: g.bookmarked };
});

const byId = (a: HandRecord, b: HandRecord) => a.id.localeCompare(b.id);

describe('export round trip', () => {
  let active: ActiveSession;
  beforeAll(async () => {
    const state = await createHand('hero');
    active = { id: crypto.randomUUID(), owner: GUEST_OWNER, state, difficulty: 'standard', nextSequence: 1, decisions: [], startedAt: new Date().toISOString() };
  });
  afterAll(async () => { await deleteLocal(GUEST_OWNER); });

  // Property: Export round trip
  // **Validates: Requirements 6.1, 6.2**
  it('exports every stored guest hand as a valid archive equal to listHands', async () => {
    await fc.assert(fc.asyncProperty(fc.uniqueArray(handArb, { selector: h => h.id, maxLength: 8 }), async records => {
      await deleteLocal(GUEST_OWNER);
      for (const record of records) await saveCompleted(GUEST_OWNER, record, active);

      const archive: unknown = JSON.parse(await exportHands(GUEST_OWNER));
      expect(archive).toMatchObject({ format: 'poker-practice', schemaVersion: 1 });
      const { hands, exportedAt } = archive as { hands: unknown[]; exportedAt: string };
      expect(Number.isNaN(Date.parse(exportedAt))).toBe(false);
      expect(Array.isArray(hands)).toBe(true);
      expect(hands).toHaveLength(records.length);

      const parsed = hands.map(h => handRecordSchema.parse(h));
      expect(parsed).toEqual(await listHands(GUEST_OWNER));
      expect([...parsed].sort(byId)).toEqual([...records].sort(byId));
    }), { numRuns: 100 });
  }, 120_000);

  it('exports an empty hand list when nothing is stored', async () => {
    await deleteLocal(GUEST_OWNER);
    const archive = JSON.parse(await exportHands(GUEST_OWNER));
    expect(archive).toMatchObject({ format: 'poker-practice', schemaVersion: 1, hands: [] });
  });
});
