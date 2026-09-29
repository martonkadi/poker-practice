import { describe, expect, it } from 'vitest';
import { chooseAction, decide } from './index';
import { createHand, observe } from '@poker/poker';
import type { EquityEstimate } from '@poker/analysis';
import type { PlayerObservation } from '@poker/contracts';

const estimate = (equity: number): EquityEstimate => ({ equity, wins: 0, ties: 0, losses: 0, samples: 512, range: 'uniform-legal-hands' });
const observation: PlayerObservation = {
  handId: 'test', sequence: 0, actor: 'bot', hole: [0, 1], board: [], street: 'preflop', button: 'bot',
  pot: 150, stacks: { hero: 9900, bot: 9950 }, commitments: { hero: 100, bot: 50 }, history: [], highestBet: 100,
  legal: { fold: true, check: false, call: 50, raise: { min: 200, max: 10000 }, allInTo: 10000 }
};
describe('versioned bot policy', () => {
  it('makes legal, seeded preflop decisions', () => {
    expect(chooseAction(observation, 'standard', estimate(0.60), () => 0)).toEqual({ kind: 'raiseTo', amount: 250 });
    expect(chooseAction(observation, 'standard', estimate(0.30), () => 0)).toEqual({ kind: 'fold' });
    expect(chooseAction(observation, 'easy', estimate(0.30), () => 0)).toEqual({ kind: 'call' });
  });
  it('cannot distinguish changed hidden cards or deck order with the same observation and RNG seed', async () => {
    const original = await createHand('hero', () => 0.5);
    const cards = original.activeSnapshot.cards;
    const altered = { ...original, activeSnapshot: { ...original.activeSnapshot, cards: {
      ...cards, holeCards: { ...cards.holeCards, bot: cards.remainingDeck.slice(0, 2) },
      remainingDeck: [...cards.remainingDeck].reverse()
    } } };
    const first = observe(original, 'hero');
    const second = observe(altered, 'hero');
    expect(second).toEqual(first);
    const seeded = () => { let x = 12345; return () => { x = (1664525 * x + 1013904223) >>> 0; return x / 2 ** 32; }; };
    const a = await decide(first, 'easy', { random: seeded() });
    const b = await decide(second, 'easy', { random: seeded() });
    expect(b).toEqual(a);
  });
});
