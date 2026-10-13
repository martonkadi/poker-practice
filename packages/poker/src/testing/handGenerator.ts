// Test-only helpers: the shared generated-hand source for the hand-level properties (3-8).
// Not exported from ../index.ts and must not be imported by production code.
import fc from 'fast-check';
import { cardToText } from '@poker/contracts';
import type { Action, Actor, Card, DecisionRecord, HandRecord, PublicAction, TableFrame } from '@poker/contracts';
import { ENGINE_PATCH_VERSION, applyAction, board, createHand, frame, handIdentity, hole, isSettled, recordedAction, result } from '../index';
import type { EngineState } from '../index';

/** Deterministic 32-bit PRNG returning samples in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same Fisher-Yates walk createHand performs with an injected `random`, so the deck is known to the test. */
export function deckFromSeed(seed: number): Card[] {
  const random = mulberry32(seed);
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

export interface HandSpec { seed: number; policySeed: number; button: Actor }
export const handSpecArb: fc.Arbitrary<HandSpec> = fc.record({
  seed: fc.integer(), policySeed: fc.integer(), button: fc.constantFrom<Actor>('hero', 'bot')
});

export interface HandStep {
  actor: Actor;
  before: EngineState;
  beforeFrame: TableFrame;
  input: Action;
  after: EngineState;
  recorded: PublicAction;
}
export interface GeneratedHand {
  spec: HandSpec;
  deck: Card[];
  initial: EngineState;
  final: EngineState;
  steps: HandStep[];
  /** Built like apps/web/src/session.ts actAndSave (frame(before), recordedAction), without persistence. Keep in sync. */
  decisions: DecisionRecord[];
}

/** Weighted random legal action: fold/check/call/min-raise/random-raise/max-raise/all-in. */
export function pickAction(f: TableFrame, random: () => number): Action {
  const legal = f.legal!;
  const options: [number, Action][] = [];
  // Weights keep big bets rare so a useful share of hands reaches the turn and river.
  if (legal.fold) options.push([1, { kind: 'fold' }]);
  if (legal.check) options.push([8, { kind: 'check' }]);
  if (legal.call !== null) options.push([8, { kind: 'call' }]);
  if (legal.raise) {
    const { min, max } = legal.raise;
    options.push([2, { kind: 'raiseTo', amount: min }]);
    // Cubed sample skews random raises toward the small end of [min, max].
    options.push([1.5, { kind: 'raiseTo', amount: Math.min(max, min + Math.floor(random() ** 3 * (max - min + 1))) }]);
    options.push([0.3, { kind: 'raiseTo', amount: max }]);
  }
  if (legal.allInTo !== null) options.push([0.3, { kind: 'raiseTo', amount: legal.allInTo }]);
  if (!options.length) throw new Error('No legal action for the actor');
  let r = random() * options.reduce((s, [w]) => s + w, 0);
  for (const [w, action] of options) if ((r -= w) < 0) return action;
  return options.at(-1)![1];
}

export type ActionPolicy = (f: TableFrame, random: () => number) => Action;

/** Check/call-heavy policy that never folds and rarely min-raises, so hands usually reach the river with a decision on every street. */
export function pickPassiveAction(f: TableFrame, random: () => number): Action {
  const legal = f.legal!;
  if (legal.raise && random() < 0.05) return { kind: 'raiseTo', amount: legal.raise.min };
  if (legal.check) return { kind: 'check' };
  if (legal.call !== null) return { kind: 'call' };
  return pickAction(f, random);
}

export async function generateHand(spec: HandSpec, pick: ActionPolicy = pickAction): Promise<GeneratedHand> {
  const deck = deckFromSeed(spec.seed);
  const initial = await createHand(spec.button, mulberry32(spec.seed));
  const policy = mulberry32(spec.policySeed);
  const steps: HandStep[] = [];
  const decisions: DecisionRecord[] = [];
  let state = initial;
  while (!isSettled(state)) {
    if (steps.length > 200) throw new Error('Generated hand did not settle');
    const beforeFrame = frame(state);
    const actor = beforeFrame.actor!;
    const input = pick(beforeFrame, policy);
    const after = await applyAction(state, actor, input);
    const recorded = recordedAction(state, after, actor);
    steps.push({ actor, before: state, beforeFrame, input, after, recorded });
    decisions.push({ frame: beforeFrame, action: recorded.action, amount: recorded.amount, heroHole: hole(state, 'hero') });
    state = after;
  }
  return { spec, deck, initial, final: state, steps, decisions };
}

const TEST_SESSION_ID = '00000000-0000-4000-8000-000000000000';
const TEST_TIME = '2025-01-01T00:00:00.000Z';

/**
 * Hand_Record for a settled generated hand. Duplicates the settlement branch of
 * apps/web/src/session.ts actAndSave (fixed session id/timestamps, standard bot, sequence 0). Keep in sync.
 */
export function toHandRecord(hand: GeneratedHand): HandRecord {
  const { final } = hand;
  const identity = handIdentity(final);
  const outcome = result(final);
  return {
    schemaVersion: 1, engineVersion: ENGINE_PATCH_VERSION, botVersion: 'standard-v1',
    id: identity.id, sessionId: TEST_SESSION_ID, sessionStartedAt: TEST_TIME, sequence: 0,
    completedAt: TEST_TIME, button: identity.button, difficulty: 'standard',
    initialHeroHole: hole(final, 'hero'), botHole: outcome.showdown ? hole(final, 'bot') : null,
    finalBoard: board(final), decisions: hand.decisions, heroNet: outcome.heroNet, reachedShowdown: outcome.showdown,
    heroWonShowdown: outcome.heroWonShowdown, bookmarked: false
  };
}

function actionText(a: Action): string { return a.kind === 'raiseTo' ? `raiseTo(${a.amount})` : a.kind; }

/** Deck (card text) and action list for failure messages. */
export function describeHand(hand: Pick<GeneratedHand, 'spec' | 'deck' | 'steps'>): string {
  const actions = hand.steps.map(s => `${s.actor}@${s.beforeFrame.street}: ${actionText(s.input)} -> ${actionText(s.recorded.action)} [${s.recorded.amount}]`);
  return [`button=${hand.spec.button} seed=${hand.spec.seed} policySeed=${hand.spec.policySeed}`,
    `deck=${hand.deck.map(cardToText).join(' ')}`, `actions:\n  ${actions.join('\n  ')}`].join('\n');
}
