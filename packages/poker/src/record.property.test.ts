import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { handRecordSchema } from '@poker/contracts';
import type { Street } from '@poker/contracts';
import { applyAction, BIG_BLIND, board, createHand, frame, isSettled, result, TOTAL_CHIPS } from './index';
import { describeHand, generateHand, handSpecArb, toHandRecord } from './testing/handGenerator';
import type { HandStep } from './testing/handGenerator';

const NUM_RUNS = 200;
const TIMEOUT_MS = 120_000;

/** Chips the input removes from the actor's stack, from the before-frame and the rules alone (not engine history). */
function expectedChipsAdded(step: HandStep): number {
  const { commitments, stacks } = step.beforeFrame;
  const commit = commitments[step.actor];
  const highest = Math.max(commitments.hero, commitments.bot);
  switch (step.input.kind) {
    case 'fold': case 'check': return 0;
    case 'call': return Math.min(highest - commit, stacks[step.actor]);
    case 'raiseTo': return step.input.amount - commit;
  }
}

describe('generated hands: canonical recording', () => {
  // Property: Canonical action consistency
  // **Validates: Requirements 3.1, 3.2, 3.3**
  it('records fold/check as 0, call vs raiseTo by street totals, and the amount as the stack decrease', async () => {
    await fc.assert(fc.asyncProperty(handSpecArb, async spec => {
      const hand = await generateHand(spec);
      const context = describeHand(hand);
      hand.steps.forEach((step, i) => {
        const record = hand.decisions[i]!;
        const label = `decision ${i} (${step.actor})\n${context}`;
        const { commitments, stacks } = step.beforeFrame;
        const highestBefore = Math.max(commitments.hero, commitments.bot);
        const added = expectedChipsAdded(step);
        expect(record.frame, label).toEqual(step.beforeFrame);
        expect(step.recorded.actor, label).toBe(step.actor);
        expect(added, label).toBeGreaterThanOrEqual(0);
        expect(added, label).toBeLessThanOrEqual(stacks[step.actor]);
        if (step.input.kind === 'fold' || step.input.kind === 'check') {
          expect(record.action, label).toEqual({ kind: step.input.kind });
          expect(record.amount, label).toBe(0);
        } else {
          const totalAfter = commitments[step.actor] + added;
          expect(added, label).toBeGreaterThan(0);
          expect(record.action, label).toEqual(totalAfter <= highestBefore ? { kind: 'call' } : { kind: 'raiseTo', amount: totalAfter });
        }
        expect(record.amount, label).toBe(added);
        // Stacks only move by the actor's own contribution until the hand settles (payout).
        if (!isSettled(step.after)) expect(frame(step.after).stacks[step.actor], label).toBe(stacks[step.actor] - record.amount);
      });
    }), { numRuns: NUM_RUNS });
  }, TIMEOUT_MS);

  // Property: Decision ordering by street
  // **Validates: Requirements 3.4**
  it('orders decisions by street and records a street-closing call before the next street is dealt', async () => {
    await fc.assert(fc.asyncProperty(handSpecArb, async spec => {
      const hand = await generateHand(spec);
      const context = describeHand(hand);
      hand.decisions.forEach((record, i) => {
        const step = hand.steps[i]!;
        const label = `decision ${i} (${step.actor})\n${context}`;
        const { street, board } = record.frame;
        // Board length matches the frame's street.
        expect(street, label).not.toBe('settled');
        expect(board.length, label).toBe(BOARD_LENGTH[street]);
        // The frame's street is the street on which the action was taken.
        expect(street, label).toBe(step.recorded.street);
        // Board length of consecutive frames never decreases.
        if (i > 0) expect(board.length, label).toBeGreaterThanOrEqual(hand.decisions[i - 1]!.frame.board.length);
        // A street-closing call precedes the first decision showing a card of the next street.
        const closesStreet = isSettled(step.after) || frame(step.after).street !== step.beforeFrame.street;
        if (step.input.kind === 'call' && closesStreet) {
          const firstLater = hand.decisions.findIndex(d => d.frame.board.length > board.length);
          if (firstLater !== -1) expect(i, label).toBeLessThan(firstLater);
        }
      });
    }), { numRuns: NUM_RUNS });
  }, TIMEOUT_MS);

  // Property: Chip conservation
  // **Validates: Requirements 3.5, 3.8**
  it('keeps stacks plus pot at 20,000 in every recorded frame and the final stacks at 20,000', async () => {
    await fc.assert(fc.asyncProperty(handSpecArb, async spec => {
      const hand = await generateHand(spec);
      const context = describeHand(hand);
      hand.decisions.forEach((record, i) => {
        const { stacks, pot } = record.frame;
        expect(stacks.hero + stacks.bot + pot, `decision ${i} (${hand.steps[i]!.actor})\n${context}`).toBe(TOTAL_CHIPS);
      });
      const finalStacks = frame(hand.final).stacks;
      expect(finalStacks.hero + finalStacks.bot, `final stacks\n${context}`).toBe(TOTAL_CHIPS);
    }), { numRuns: NUM_RUNS });
  }, TIMEOUT_MS);

  // Property: Replay round trip
  // **Validates: Requirements 3.6, 3.8, 5.8**
  it('saves a schema-valid Hand_Record whose canonical actions replay to the same board and outcome', async () => {
    await fc.assert(fc.asyncProperty(handSpecArb, async spec => {
      const hand = await generateHand(spec);
      const context = describeHand(hand);
      const parsed = handRecordSchema.safeParse(toHandRecord(hand));
      expect(parsed.error?.issues, `schema\n${context}`).toBeUndefined();
      const record = parsed.data!;
      // Replay from the reconstructed deck (also cross-checks createHand's shuffle) and the saved button.
      let state = await createHand(record.button, undefined, hand.deck);
      for (const [i, decision] of record.decisions.entries()) {
        const actor = decision.frame.actor!;
        expect(frame(state), `replay frame ${i}\n${context}`).toEqual(decision.frame);
        state = await applyAction(state, actor, decision.action);
      }
      const label = `replayed outcome\n${context}`;
      expect(isSettled(state), label).toBe(true);
      const outcome = result(state);
      expect(board(state), label).toEqual(record.finalBoard);
      expect(outcome.heroNet, label).toBe(record.heroNet);
      expect(outcome.showdown, label).toBe(record.reachedShowdown);
      expect(outcome.heroWonShowdown, label).toBe(record.heroWonShowdown);
    }), { numRuns: NUM_RUNS });
  }, TIMEOUT_MS);

  // Property: Hero contribution sum
  // **Validates: Requirements 3.7, 3.8**
  it("sums the hero's recorded amounts plus posted blind to the hero's total contribution", async () => {
    await fc.assert(fc.asyncProperty(handSpecArb, async spec => {
      const hand = await generateHand(spec);
      const context = describeHand(hand);
      const payouts = hand.final.activeSnapshot.hand.payouts;
      expect(payouts, `settlement payouts\n${context}`).toBeDefined();
      // The engine returns uncalled excess as a single-eligible side pot inside payouts, so
      // final stack minus every hero payout entry is the stack before the award, and
      // 10,000 minus that is every chip the hero put in (including any later-refunded excess).
      const heroAward = payouts!.entries.filter(e => e.playerId === 'hero').reduce((sum, e) => sum + e.amount, 0);
      const heroStackBeforeAward = frame(hand.final).stacks.hero - heroAward;
      const blind = spec.button === 'hero' ? 50 : BIG_BLIND;
      const recorded = hand.decisions.filter((_, i) => hand.steps[i]!.actor === 'hero').reduce((sum, d) => sum + d.amount, 0);
      expect(recorded + blind, `hero contribution (award ${heroAward})\n${context}`).toBe(10_000 - heroStackBeforeAward);
    }), { numRuns: NUM_RUNS });
  }, TIMEOUT_MS);
});

const BOARD_LENGTH: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5, settled: 5 };
