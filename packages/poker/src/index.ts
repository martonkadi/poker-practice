import { DEFAULT_RANDOM_STATE_CONFIG, ENGINE_VERSION, SessionManager, generateRandomState, selectDecisionContext, selectTableView, toSnapshotEnvelope } from 'poker-engine-ts';
import type { Card as EngineCard, PlayerAction, SerializableSessionState } from 'poker-engine-ts';
import { cardToText, textToCard } from '@poker/contracts';
import type { Action, Actor, Card, LegalActionSet, PlayerObservation, PublicAction, Street, TableFrame } from '@poker/contracts';

export type EngineState = SerializableSessionState;
export const ENGINE_PATCH_VERSION = `${ENGINE_VERSION}+blind-opening-contributions-v1`;
const SEATS = [{ playerId: 'hero', seatIndex: 0, stack: 10_000 }, { playerId: 'bot', seatIndex: 1, stack: 10_000 }] as const;
const CONFIG = {
  ...DEFAULT_RANDOM_STATE_CONFIG,
  maxSeats: 2 as const,
  startingStack: 10_000,
  blindSchedule: [{ level: 1, smallBlind: 50, bigBlind: 100 }],
  autoAdvance: true
};

function secureIndex(size: number): number {
  const limit = Math.floor(2 ** 32 / size) * size;
  const bytes = new Uint32Array(1);
  do { crypto.getRandomValues(bytes); } while (bytes[0]! >= limit);
  return bytes[0]! % size;
}

export async function createHand(button: Actor, random?: () => number, fixedDeck?: Card[]): Promise<EngineState> {
  if (fixedDeck && (fixedDeck.length !== 52 || new Set(fixedDeck).size !== 52 || fixedDeck.some(x => !Number.isInteger(x) || x < 0 || x > 51))) throw new Error('Invalid test deck');
  const deck = (fixedDeck ?? Array.from({ length: 52 }, (_, i) => i)).map(i => cardToText(i) as EngineCard);
  if (!fixedDeck) for (let i = deck.length - 1; i > 0; i--) {
    const sample = random?.();
    if (sample !== undefined && (sample < 0 || sample >= 1 || !Number.isFinite(sample))) throw new Error('Invalid injected RNG sample');
    const j = sample === undefined ? secureIndex(i + 1) : Math.floor(sample * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  const summary = await generateRandomState({
    config: CONFIG, seats: SEATS, steps: { min: 0, max: 0 },
    managerOptions: { sessionId: crypto.randomUUID(), buttonIndex: button === 'hero' ? 0 : 1, perTurnMs: 0, deck }
  });
  assertCards(summary.session);
  return summary.session;
}

function assertCards(state: EngineState): void {
  const cards = state.activeSnapshot.cards.holeCards;
  if (cards.hero?.length !== 2 || cards.bot?.length !== 2) throw new Error('Engine did not deal complete hole cards');
}
function street(stage: string): Street { return stage === 'preflop' || stage === 'flop' || stage === 'turn' || stage === 'river' ? stage : 'settled'; }
export function board(state: EngineState): Card[] {
  const b = selectTableView(state as never).board;
  return [...(b.flop ?? []), ...(b.turn ? [b.turn] : []), ...(b.river ? [b.river] : [])].map(textToCard);
}
export function hole(state: EngineState, actor: Actor): [Card, Card] {
  const cards = state.activeSnapshot.cards.holeCards[actor];
  if (!cards || cards.length !== 2) throw new Error('Missing private cards');
  return [textToCard(cards[0]!), textToCard(cards[1]!)];
}
function currentRound(state: EngineState) { return state.activeSnapshot.hand.bettingRounds.at(-1); }
function commitments(state: EngineState): Record<Actor, number> {
  const r = currentRound(state);
  const opening = (r as (typeof r & { openingContributions?: Partial<Record<Actor, number>> }) | undefined)?.openingContributions;
  const result = { hero: Number(opening?.hero ?? (r?.stage === 'preflop' ? state.activeSnapshot.hand.blinds.smallBlind.playerId === 'hero' ? 50 : 100 : 0)),
    bot: Number(opening?.bot ?? (r?.stage === 'preflop' ? state.activeSnapshot.hand.blinds.smallBlind.playerId === 'bot' ? 50 : 100 : 0)) };
  for (const turn of r?.turns ?? []) if (turn.actor === 'hero' || turn.actor === 'bot') result[turn.actor] += turn.contribution;
  return result;
}
export function legalActions(state: EngineState, seat: Actor): LegalActionSet {
  const decision = selectDecisionContext(state as never);
  if (decision.actor !== seat) return { fold: false, check: false, call: null, raise: null, allInTo: null };
  const options = decision.availableActions.filter(x => !x.disabled);
  const raise = options.find(x => x.type === 'raise' || x.type === 'bet');
  const allIn = options.find(x => x.type === 'all-in');
  const call = options.find(x => x.type === 'call');
  const commit = commitments(state)[seat];
  return {
    fold: options.some(x => x.type === 'fold'), check: options.some(x => x.type === 'check'),
    call: call?.type === 'call' ? call.amount : null,
    raise: raise && (raise.type === 'raise' || raise.type === 'bet') ? { min: raise.min, max: raise.max } : null,
    allInTo: allIn?.type === 'all-in' ? commit + state.activeSnapshot.seating.seats.find(x => x.occupant?.playerId === seat)!.stack : null
  };
}
export function frame(state: EngineState): TableFrame {
  const d = selectDecisionContext(state as never);
  const view = selectTableView(state as never);
  const stacks = { hero: view.seats.find(x => x.playerId === 'hero')?.stack ?? 0, bot: view.seats.find(x => x.playerId === 'bot')?.stack ?? 0 };
  const actor = d.actor === 'hero' || d.actor === 'bot' ? d.actor : null;
  return { street: street(view.handStage), board: board(state), pot: view.potTotal, stacks, commitments: commitments(state), actor, legal: actor ? legalActions(state, actor) : null };
}
export function history(state: EngineState): PublicAction[] {
  return state.activeSnapshot.hand.bettingRounds.flatMap(round => round.turns.filter(x => x.actor === 'hero' || x.actor === 'bot').map(turn => ({
    actor: turn.actor as Actor, street: street(round.stage),
    action: eventAction(turn.action), amount: turn.contribution
  })));
}
function eventAction(action: PlayerAction): Action {
  if (action.type === 'fold' || action.type === 'check' || action.type === 'call') return { kind: action.type };
  if (action.type === 'bet' || action.type === 'raise' || action.type === 'all-in') return { kind: 'raiseTo', amount: action.type === 'raise' ? action.to ?? action.amount : action.amount };
  throw new Error(`Unexpected action in betting history: ${action.type}`);
}
export function observe(state: EngineState, seat: Actor): PlayerObservation {
  const f = frame(state);
  if (f.actor !== seat || !f.legal) throw new Error('Not this player’s decision');
  return {
    handId: state.activeSnapshot.hand.id, sequence: state.events.length, actor: seat, hole: hole(state, seat),
    board: f.board, street: f.street, button: state.activeSnapshot.seating.dealerButton === 0 ? 'hero' : 'bot',
    pot: f.pot, stacks: f.stacks, commitments: f.commitments, history: history(state), legal: f.legal,
    highestBet: currentRound(state)?.highestBet ?? 0
  };
}
export async function applyAction(state: EngineState, seat: Actor, action: Action): Promise<EngineState> {
  const legal = legalActions(state, seat);
  const commit = commitments(state)[seat];
  let requested: PlayerAction;
  if (action.kind === 'fold' && legal.fold) requested = { type: 'fold' };
  else if (action.kind === 'check' && legal.check) requested = { type: 'check' };
  else if (action.kind === 'call' && legal.call !== null) requested = { type: 'call', amount: legal.call };
  else if (action.kind === 'raiseTo' && Number.isSafeInteger(action.amount) && legal.allInTo === action.amount) {
    const from = state.activeSnapshot.seating.seats.find(x => x.occupant?.playerId === seat)!.stack <= (legal.call ?? 0) ? 'call' : state.activeSnapshot.hand.stage === 'preflop' || state.activeSnapshot.hand.bettingRounds.at(-1)!.highestBet > 0 ? 'raise' : 'bet';
    requested = { type: 'all-in', amount: action.amount - commit, from };
  } else if (action.kind === 'raiseTo' && legal.raise && action.amount >= legal.raise.min && action.amount <= legal.raise.max) {
    const type = state.activeSnapshot.hand.bettingRounds.at(-1)!.highestBet === 0 ? 'bet' : 'raise';
    requested = type === 'bet' ? { type: 'bet', amount: action.amount - commit } : { type: 'raise', amount: action.amount - commit, to: action.amount };
  } else throw new Error('Illegal action');
  const manager = SessionManager.resume({ sessionId: state.id, config: state.config, runtimeContext: state.runtimeContext,
    initialSnapshot: state.initialSnapshot, events: state.events, metrics: state.metrics, channels: state.channels });
  const result = await manager.applyIntent({ id: crypto.randomUUID(), actor: seat, requested, origin: seat === 'hero' ? 'ui' : 'ai', issuedAt: Date.now(), expectedSnapshotVersion: manager.session.activeSnapshot.index });
  if (result.validation.kind !== 'accepted') throw new Error(`Engine rejected action: ${result.validation.reason}`);
  return { ...state, activeSnapshot: manager.session.activeSnapshot, events: manager.eventLog, metrics: manager.session.metrics };
}
export function isSettled(state: EngineState): boolean { return !selectDecisionContext(state as never).actor; }
export function result(state: EngineState): { heroNet: number; showdown: boolean; heroWonShowdown: boolean } {
  if (!isSettled(state)) throw new Error('Hand is still live');
  const heroStack = state.activeSnapshot.seating.seats.find(x => x.occupant?.playerId === 'hero')?.stack ?? 0;
  const showdown = !!state.activeSnapshot.hand.showdown;
  return { heroNet: heroStack - 10_000, showdown, heroWonShowdown: showdown && heroStack > 10_000 };
}
export function restoreState(raw: EngineState): EngineState {
  const manager = SessionManager.resume({ sessionId: raw.id, config: raw.config, runtimeContext: raw.runtimeContext,
    initialSnapshot: raw.initialSnapshot, events: raw.events, metrics: raw.metrics, channels: raw.channels });
  assertCards({ ...raw, activeSnapshot: manager.session.activeSnapshot });
  return { ...raw, activeSnapshot: manager.session.activeSnapshot, initialSnapshot: toSnapshotEnvelope(manager.session.initialSnapshot) };
}
