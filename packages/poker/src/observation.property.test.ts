// Feature: guest-mvp-release, Property 8: Bot observation isolation
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Card, PlayerObservation, Street } from '@poker/contracts';
import { board, hole, observe } from './index';
import { describeHand, generateHand, handSpecArb, pickAction, pickPassiveAction } from './testing/handGenerator';

const NUM_RUNS = 120;
const TIMEOUT_MS = 120_000;
/** Every key of PlayerObservation (packages/contracts); the bot may receive nothing else. */
const OBSERVATION_KEYS = ['actor', 'board', 'button', 'commitments', 'handId', 'highestBet', 'history', 'hole', 'legal', 'pot', 'sequence', 'stacks', 'street'];
const BOARD_SIZE: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5, settled: -1 };
const CARD_TEXT = /^[2-9TJQKA][cdhs]$/;

/**
 * Cards are ints 0-51, so scanning the JSON for numbers would false-positive on pot/stacks/amounts.
 * Instead walk the payload: record the path of every number array (the only card-bearing shape) and
 * every key, and collect string values so a card in text form ("Ah") cannot slip through either.
 */
function walk(value: unknown, path: string, out: { numberArrays: string[]; keys: Set<string>; strings: [string, string][] }): void {
  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(x => typeof x === 'number')) out.numberArrays.push(path);
    value.forEach((x, i) => walk(x, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { out.keys.add(k); walk(v, path ? `${path}.${k}` : k, out); }
  } else if (typeof value === 'string') out.strings.push([path, value]);
}

function checkObservation(obs: PlayerObservation, expected: { botHole: Card[]; heroHole: Card[]; dealt: Card[]; street: Street; handId: string }): void {
  expect(Object.keys(obs).sort()).toEqual(OBSERVATION_KEYS);
  expect(obs.actor).toBe('bot');
  expect(obs.hole).toEqual(expected.botHole);
  expect(obs.street).toBe(expected.street);
  expect(obs.board).toEqual(expected.dealt);
  // Round-trip through JSON: this is what structured cloning to the worker carries.
  const payload: unknown = JSON.parse(JSON.stringify(obs));
  const out = { numberArrays: [] as string[], keys: new Set<string>(), strings: [] as [string, string][] };
  walk(payload, '', out);
  // Only hole and board may hold cards (board is absent from the list preflop because it is empty).
  expect(out.numberArrays.filter(p => p !== 'hole' && p !== 'board')).toEqual([]);
  for (const forbidden of ['deck', 'remainingDeck', 'holeCards', 'cards', 'heroHole', 'botHole', 'runout'])
    expect(out.keys.has(forbidden)).toBe(false);
  for (const [path, s] of out.strings) {
    if (path === 'handId') expect(s).toBe(expected.handId);
    else expect(s).not.toMatch(CARD_TEXT);
  }
  const visible = [...obs.hole, ...obs.board];
  const allowed = new Set([...expected.botHole, ...expected.dealt]);
  for (const c of visible) expect(allowed.has(c)).toBe(true);
  for (const c of expected.heroHole) expect(visible).not.toContain(c);
}

describe('Property 8: Bot observation isolation', () => {
  it('bot observations carry only the bot hole cards and the board dealt so far (Req 4.1, 4.2, 4.5)', async () => {
    const streetsSeen = new Set<Street>();
    let botDecisions = 0;
    await fc.assert(fc.asyncProperty(handSpecArb, fc.boolean(), async (spec, passive) => {
      // Half the hands use a check/call policy so bot decisions reach the turn and river.
      const hand = await generateHand(spec, passive ? pickPassiveAction : pickAction);
      const heroHole = hole(hand.initial, 'hero');
      const botHole = hole(hand.initial, 'bot');
      const finalBoard = board(hand.final);
      const handId = hand.initial.activeSnapshot.hand.id;
      for (const step of hand.steps) {
        if (step.actor !== 'bot') continue;
        const street = step.beforeFrame.street;
        // Cards dealt so far: the street's board size, taken as a prefix of the hand's final runout.
        const size = BOARD_SIZE[street];
        expect(size, describeHand(hand)).toBeGreaterThanOrEqual(0);
        const dealt = finalBoard.slice(0, size);
        expect(dealt.length, describeHand(hand)).toBe(size);
        const obs = observe(step.before, 'bot');
        try { checkObservation(obs, { botHole, heroHole, dealt, street, handId }); }
        catch (error) { throw new Error(`${(error as Error).message}\n${describeHand(hand)}`); }
        streetsSeen.add(street); botDecisions++;
      }
    }), { numRuns: NUM_RUNS });
    expect(botDecisions).toBeGreaterThan(0);
    expect([...streetsSeen].sort()).toEqual(['flop', 'preflop', 'river', 'turn']);
  }, TIMEOUT_MS);
});
