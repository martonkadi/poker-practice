import { describe, expect, it } from 'vitest';
import { DEFAULT_RANDOM_STATE_CONFIG, generateRandomState } from 'poker-engine-ts';
import type { Card as EngineCard } from 'poker-engine-ts';
import { cardToText, textToCard } from '@poker/contracts';
import type { Action, Actor, Card, Street } from '@poker/contracts';
import { TOTAL_CHIPS, applyAction, createHand, frame, history, hole, isSettled, recordedAction } from './index';
import type { EngineState } from './index';
import data from '../fixtures/rules-regression.json';

interface Decision {
  actor: Actor; street: Street; input: Action; action: Action; amount: number;
  outstanding?: number; closesStreet?: boolean;
}
interface Fixture {
  name: string; button: Actor; stacks: Record<Actor, number>;
  hole: Record<Actor, [string, string]>; board: string[]; decisions: Decision[];
  final: { board: string[]; stacks: Record<Actor, number>; showdown: boolean };
}
const fixtures = data.fixtures as unknown as Fixture[];
const other = (actor: Actor): Actor => (actor === 'hero' ? 'bot' : 'hero');
const cards = (texts: string[]): Card[] => texts.map(textToCard);

/** Deck order: non-button hole, button hole, burn, flop, burn, turn, burn, river, then the rest. */
function deckFor(fx: Fixture): Card[] {
  const used = cards([...fx.hole[other(fx.button)], ...fx.hole[fx.button], ...fx.board]);
  const rest = Array.from({ length: 52 }, (_, i) => i).filter(i => !used.includes(i));
  const [b1, b2, b3, ...tail] = rest;
  const [f1, f2, f3, turn, river] = cards(fx.board);
  return [...used.slice(0, 4), b1!, f1!, f2!, f3!, b2!, turn!, b3!, river!, ...tail];
}

/**
 * Standard fixtures go through createHand. Unequal stacks cannot occur in the MVP (both seats
 * always start at 10,000), so the short-call fixture builds an otherwise identical engine state
 * with the same seats, blinds and deck rules; every action still goes through the adapter.
 */
async function deal(fx: Fixture, deck: Card[]): Promise<EngineState> {
  if (fx.stacks.hero === 10_000 && fx.stacks.bot === 10_000) return createHand(fx.button, undefined, deck);
  const summary = await generateRandomState({
    config: { ...DEFAULT_RANDOM_STATE_CONFIG, maxSeats: 2, startingStack: 10_000,
      blindSchedule: [{ level: 1, smallBlind: 50, bigBlind: 100 }], autoAdvance: true },
    seats: [{ playerId: 'hero', seatIndex: 0, stack: fx.stacks.hero }, { playerId: 'bot', seatIndex: 1, stack: fx.stacks.bot }],
    steps: { min: 0, max: 0 },
    managerOptions: { sessionId: crypto.randomUUID(), buttonIndex: fx.button === 'hero' ? 0 : 1, perTurnMs: 0,
      deck: deck.map(i => cardToText(i) as EngineCard) }
  });
  return summary.session;
}

describe('rules regression fixtures (Req 3.10)', () => {
  it('covers each required case', () => {
    expect(fixtures.map(fx => fx.name)).toEqual([
      'preflop all-in call', 'postflop all-in call', 'short all-in call', 'all-in raise',
      'street-closing call', 'fold after a raise', 'split pot'
    ]);
  });

  for (const fx of fixtures) {
    it(fx.name, async () => {
      let state = await deal(fx, deckFor(fx));
      expect(hole(state, 'hero')).toEqual(cards(fx.hole.hero));
      expect(hole(state, 'bot')).toEqual(cards(fx.hole.bot));
      for (const [index, d] of fx.decisions.entries()) {
        const label = `${fx.name} decision ${index + 1}`;
        const before = frame(state);
        expect(before.actor, label).toBe(d.actor);
        expect(before.street, label).toBe(d.street);
        expect(before.stacks.hero + before.stacks.bot + before.pot, label).toBe(TOTAL_CHIPS);
        if (d.outstanding !== undefined) {
          const highest = Math.max(before.commitments.hero, before.commitments.bot);
          expect(highest - before.commitments[d.actor], label).toBe(d.outstanding);
        }
        const next = await applyAction(state, d.actor, d.input);
        expect(recordedAction(state, next, d.actor), label)
          .toEqual({ actor: d.actor, street: d.street, action: d.action, amount: d.amount });
        if (d.closesStreet) expect(frame(next).street, label).not.toBe(d.street);
        state = next;
      }
      expect(isSettled(state)).toBe(true);
      expect(history(state)).toEqual(fx.decisions.map(d => ({ actor: d.actor, street: d.street, action: d.action, amount: d.amount })));
      expect(frame(state).board).toEqual(cards(fx.final.board));
      expect(frame(state).stacks).toEqual(fx.final.stacks);
      expect(!!state.activeSnapshot.hand.showdown).toBe(fx.final.showdown);
    });
  }
});
