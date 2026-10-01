import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_RANDOM_STATE_CONFIG, SessionManager, applyOptionToState, generateRandomState, rebuildPotLedger, selectDecisionContext, settlePots } from 'poker-engine-ts';
import type { Card as EngineCard, ShowdownSummary } from 'poker-engine-ts';
import { cardToText } from '@poker/contracts';
import { BIG_BLIND, RecordError, TOTAL_CHIPS, applyAction, createHand, frame, hole, isSettled, legalActions, observe, recordedAction, restoreState, result } from './index';

describe('poker engine adapter', () => {
  it('replays street transitions exactly even when the clock advances during the action', async () => {
    let state = await createHand('hero');
    state = await applyAction(state, 'hero', { kind: 'call' });
    let tick = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => tick++);
    try {
      state = await applyAction(state, 'bot', { kind: 'check' });
      expect(frame(state).street).toBe('flop');
      expect(restoreState(state).activeSnapshot).toEqual(state.activeSnapshot);
    } finally { clock.mockRestore(); }
  });
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
    await expect(applyAction(state, 'hero', { kind: 'raiseTo', amount: 200.5 })).rejects.toThrow('Illegal action');
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

  it('records an all-in that only matches the bet as a call, by amount', async () => {
    const start = await createHand('hero');
    const raised = await applyAction(start, 'hero', { kind: 'raiseTo', amount: 10_000 });
    expect(recordedAction(start, raised, 'hero')).toEqual({ actor: 'hero', street: 'preflop', action: { kind: 'raiseTo', amount: 10_000 }, amount: 9_950 });
    // Bot pushes all-in for exactly the outstanding bet; the engine labels it `all-in`.
    const called = await applyAction(raised, 'bot', { kind: 'raiseTo', amount: 10_000 });
    expect(recordedAction(raised, called, 'bot')).toEqual({ actor: 'bot', street: 'preflop', action: { kind: 'call' }, amount: 9_900 });
  });

  it('records an all-in over the highest bet as raiseTo with only the chips added', async () => {
    let state = await createHand('hero');
    state = await applyAction(state, 'hero', { kind: 'raiseTo', amount: 9_900 });
    const before = state;
    state = await applyAction(state, 'bot', { kind: 'raiseTo', amount: 10_000 });
    expect(recordedAction(before, state, 'bot')).toEqual({ actor: 'bot', street: 'preflop', action: { kind: 'raiseTo', amount: 10_000 }, amount: 9_900 });
    const beforeCall = state;
    state = await applyAction(state, 'hero', { kind: 'call' });
    expect(recordedAction(beforeCall, state, 'hero')).toEqual({ actor: 'hero', street: 'preflop', action: { kind: 'call' }, amount: 100 });
  });

  it('records fold and check with amount 0 and rejects unmatched turns', async () => {
    const start = await createHand('hero');
    const called = await applyAction(start, 'hero', { kind: 'call' });
    const checked = await applyAction(called, 'bot', { kind: 'check' });
    expect(recordedAction(called, checked, 'bot')).toEqual({ actor: 'bot', street: 'preflop', action: { kind: 'check' }, amount: 0 });
    const folded = await applyAction(start, 'hero', { kind: 'fold' });
    expect(recordedAction(start, folded, 'hero')).toEqual({ actor: 'hero', street: 'preflop', action: { kind: 'fold' }, amount: 0 });
    expect(() => recordedAction(start, called, 'bot')).toThrow(RecordError);
    expect(() => recordedAction(start, checked, 'hero')).not.toThrow();
    expect(() => recordedAction(start, start, 'hero')).toThrow(RecordError);
    expect(BIG_BLIND).toBe(100);
    expect(TOTAL_CHIPS).toBe(20_000);
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

  it('replays a complete three-seat all-in hand with unequal stacks', async () => {
    const dealt = await generateRandomState({
      config: { ...DEFAULT_RANDOM_STATE_CONFIG, maxSeats: 6, startingStack: 201,
        blindSchedule: [{ level: 1, smallBlind: 1, bigBlind: 2 }], autoAdvance: true },
      seats: [
        { playerId: 'a', seatIndex: 0, stack: 101 },
        { playerId: 'b', seatIndex: 1, stack: 201 },
        { playerId: 'c', seatIndex: 2, stack: 201 }
      ],
      steps: { min: 0, max: 0 },
      managerOptions: { sessionId: crypto.randomUUID(), buttonIndex: 0, perTurnMs: 0,
        deck: Array.from({ length: 52 }, (_, i) => cardToText(i) as EngineCard) }
    });
    let state = dealt.session;
    for (const type of ['all-in', 'all-in', 'call']) {
      const decision = selectDecisionContext(state as never);
      const option = decision.availableActions.find(x => x.type === type && !x.disabled);
      expect(option, `${decision.actor} must have a legal ${type}`).toBeDefined();
      state = (await applyOptionToState(state, decision.actor!, option!)).session;
    }
    expect(selectDecisionContext(state as never).actor).toBeFalsy();
    expect(state.activeSnapshot.hand.stage).toBe('settled');
    expect(state.activeSnapshot.hand.payouts?.entries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(503);
    expect(state.activeSnapshot.hand.payouts?.entries.flatMap(entry => entry.potIds)).toContain('pot-side-1');
    expect(state.activeSnapshot.seating.seats.reduce((sum, seat) => sum + seat.stack, 0)).toBe(503);
    const replayed = SessionManager.resume({ sessionId: state.id, config: state.config, runtimeContext: state.runtimeContext,
      initialSnapshot: state.initialSnapshot, events: state.events, metrics: state.metrics, channels: state.channels });
    expect(replayed.session.activeSnapshot).toEqual(state.activeSnapshot);
  });

  it('conserves chips and replays a six-seat passive hand at the engine boundary', async () => {
    const dealt = await generateRandomState({
      config: { ...DEFAULT_RANDOM_STATE_CONFIG, maxSeats: 6, startingStack: 100,
        blindSchedule: [{ level: 1, smallBlind: 1, bigBlind: 2 }], autoAdvance: true },
      seats: Array.from({ length: 6 }, (_, seatIndex) => ({ playerId: `p${seatIndex}`, seatIndex, stack: 100 })),
      steps: { min: 0, max: 0 },
      managerOptions: { sessionId: crypto.randomUUID(), buttonIndex: 0, perTurnMs: 0,
        deck: Array.from({ length: 52 }, (_, i) => cardToText(i) as EngineCard) }
    });
    let state = dealt.session;
    for (let step = 0; step < 60; step++) {
      const decision = selectDecisionContext(state as never);
      if (!decision.actor) break;
      const option = decision.availableActions.find(x => !x.disabled && x.type === 'check')
        ?? decision.availableActions.find(x => !x.disabled && x.type === 'call');
      expect(option, `${decision.actor} must be able to continue passively`).toBeDefined();
      state = (await applyOptionToState(state, decision.actor, option!)).session;
      const total = state.activeSnapshot.seating.seats.reduce((sum, seat) => sum + seat.stack, 0)
        + state.activeSnapshot.pots.main.amount + state.activeSnapshot.pots.sides.reduce((sum, pot) => sum + pot.amount, 0);
      expect(total).toBe(600);
    }
    expect(state.activeSnapshot.hand.stage).toBe('settled');
    const replayed = SessionManager.resume({ sessionId: state.id, config: state.config, runtimeContext: state.runtimeContext,
      initialSnapshot: state.initialSnapshot, events: state.events, metrics: state.metrics, channels: state.channels });
    expect(replayed.session.activeSnapshot).toEqual(state.activeSnapshot);
  });
});
