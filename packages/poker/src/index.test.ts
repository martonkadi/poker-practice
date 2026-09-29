import { describe, expect, it } from 'vitest';
import { rebuildPotLedger, settlePots } from 'poker-engine-ts';
import type { ShowdownSummary } from 'poker-engine-ts';
import { applyAction, createHand, frame, hole, isSettled, legalActions, observe, restoreState, result } from './index';

describe('poker engine adapter', () => {
  it('posts blinds and charges only the missing half blind on a call', async () => {
    let state = await createHand('hero');
    expect(frame(state).pot).toBe(150);
    expect(legalActions(state, 'hero').call).toBe(50);
    state = await applyAction(state, 'hero', { kind: 'call' });
    expect(frame(state).pot).toBe(200);
    expect(frame(state).stacks).toEqual({ hero: 9900, bot: 9900 });
    expect(frame(state).actor).toBe('bot');
    expect(legalActions(state, 'bot').check).toBe(true);
  });

  it('hides opponent cards from observations', async () => {
    const state = await createHand('hero');
    const view = observe(state, 'hero');
    expect(view.hole).toEqual(hole(state, 'hero'));
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(hole(state, 'bot')));
    expect(view).not.toHaveProperty('remainingDeck');
  });

  it('replays and settles 100 passive hands with conserved chips', async () => {
    for (let hand = 0; hand < 100; hand++) {
      let state = await createHand(hand % 2 === 0 ? 'hero' : 'bot');
      for (let step = 0; step < 30 && !isSettled(state); step++) {
        const actor = frame(state).actor!;
        const legal = legalActions(state, actor);
        state = await applyAction(state, actor, legal.check ? { kind: 'check' } : { kind: 'call' });
        expect(frame(state).stacks.hero + frame(state).stacks.bot + frame(state).pot).toBe(20_000);
        const cards = [...hole(state, 'hero'), ...hole(state, 'bot'), ...frame(state).board];
        expect(new Set(cards).size).toBe(cards.length);
      }
      expect(isSettled(state)).toBe(true);
      expect(restoreState(state).activeSnapshot).toEqual(state.activeSnapshot);
      expect(Number.isSafeInteger(result(state).heroNet)).toBe(true);
    }
  }, 30_000);

  it('resolves a preflop all-in call and conserves the full pot', async () => {
    let state = await createHand('hero');
    state = await applyAction(state, 'hero', { kind: 'raiseTo', amount: 10_000 });
    expect(frame(state).actor).toBe('bot');
    expect(legalActions(state, 'bot').call).toBe(9_900);
    state = await applyAction(state, 'bot', { kind: 'call' });
    expect(isSettled(state)).toBe(true);
    expect(frame(state).board).toHaveLength(5);
    expect(frame(state).stacks.hero + frame(state).stacks.bot).toBe(20_000);
    expect(restoreState(state).activeSnapshot).toEqual(state.activeSnapshot);
  });

  it('keeps the big blind option and enforces the minimum raise', async () => {
    let state = await createHand('hero');
    expect(legalActions(state, 'hero').raise?.min).toBe(200);
    await expect(applyAction(state, 'hero', { kind: 'raiseTo', amount: 199 })).rejects.toThrow('Illegal action');
    state = await applyAction(state, 'hero', { kind: 'call' });
    expect(legalActions(state, 'bot').check).toBe(true);
    expect(legalActions(state, 'bot').raise?.min).toBe(200);
    state = await applyAction(state, 'bot', { kind: 'check' });
    expect(frame(state).street).toBe('flop');
    expect(frame(state).actor).toBe('bot');
  });

  it('settles a fold without revealing the other hand', async () => {
    let state = await createHand('hero');
    state = await applyAction(state, 'hero', { kind: 'fold' });
    expect(isSettled(state)).toBe(true);
    expect(result(state)).toEqual({ heroNet: -50, showdown: false, heroWonShowdown: false });
    expect(frame(state).stacks.hero + frame(state).stacks.bot).toBe(20_000);
  });

  it('permits a short final all-in and a capped call', async () => {
    let state = await createHand('hero');
    state = await applyAction(state, 'hero', { kind: 'raiseTo', amount: 9_900 });
    state = await applyAction(state, 'bot', { kind: 'raiseTo', amount: 10_000 });
    expect(legalActions(state, 'hero').call).toBe(100);
    expect(legalActions(state, 'hero').raise).toBeNull();
    state = await applyAction(state, 'hero', { kind: 'call' });
    expect(isSettled(state)).toBe(true);
    expect(frame(state).stacks.hero + frame(state).stacks.bot).toBe(20_000);
  });

  it('refunds uncalled excess after a fold', async () => {
    let state = await createHand('hero');
    state = await applyAction(state, 'hero', { kind: 'raiseTo', amount: 10_000 });
    state = await applyAction(state, 'bot', { kind: 'fold' });
    expect(isSettled(state)).toBe(true);
    expect(result(state).heroNet).toBe(100);
    expect(frame(state).stacks.hero + frame(state).stacks.bot).toBe(20_000);
  });

  it('splits a board-only royal flush and replays the tie', async () => {
    const front = [0, 13, 27, 41, 1, 8, 9, 10, 2, 11, 3, 12];
    const deck = [...front, ...Array.from({ length: 52 }, (_, i) => i).filter(i => !front.includes(i))];
    let state = await createHand('hero', undefined, deck);
    for (let step = 0; step < 20 && !isSettled(state); step++) {
      const actor = frame(state).actor!;
      const legal = legalActions(state, actor);
      state = await applyAction(state, actor, legal.check ? { kind: 'check' } : { kind: 'call' });
    }
    expect(isSettled(state)).toBe(true);
    expect(frame(state).board).toEqual([8, 9, 10, 11, 12]);
    expect(result(state)).toEqual({ heroNet: 0, showdown: true, heroWonShowdown: false });
    expect(frame(state).stacks).toEqual({ hero: 10_000, bot: 10_000 });
    expect(restoreState(state).activeSnapshot).toEqual(state.activeSnapshot);
  });

  it('forms multiway side pots and awards an odd chip left of the button', async () => {
    const pots = rebuildPotLedger({
      contributions: new Map([['a', 101], ['b', 201], ['c', 201]]),
      foldedPlayers: new Set(), allInPlayers: new Set(['a'])
    });
    expect(pots.main.amount).toBe(303);
    expect(pots.sides.map(x => x.amount)).toEqual([200]);
    expect(pots.sides[0]?.eligiblePlayers).toEqual(['b', 'c']);
    const base = (await createHand('hero')).activeSnapshot;
    const snapshot = { ...base, pots, seating: { dealerButton: 0, seats: ['a', 'b', 'c'].map((playerId, index) => ({ index, status: 'occupied' as const, stack: 0, occupant: { playerId, displayName: playerId } })) } };
    const summary: ShowdownSummary = { board: [], evaluatorId: 'fixture', evaluatedHands: [
      { playerId: 'a', rankClass: 'pair', rankValue: 1, bestFive: [], kickers: [] },
      { playerId: 'b', rankClass: 'straight', rankValue: 4, bestFive: [], kickers: [] },
      { playerId: 'c', rankClass: 'straight', rankValue: 4, bestFive: [], kickers: [] }
    ] };
    const payout = settlePots(snapshot, summary);
    expect(Object.fromEntries(payout.entries.map(x => [x.playerId, x.amount]))).toEqual({ b: 252, c: 251 });
    expect(payout.entries.reduce((sum, x) => sum + x.amount, 0)).toBe(503);
  });
});
