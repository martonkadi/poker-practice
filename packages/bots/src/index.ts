import type { Action, Difficulty, PlayerObservation } from '@poker/contracts';
import { estimateEquity, potOdds } from '@poker/analysis';
import type { EquityEstimate } from '@poker/analysis';

export const BOT_VERSIONS = { easy: 'easy-v1', standard: 'standard-v1' } as const;
export interface BotDecision { action: Action; botVersion: 'easy-v1' | 'standard-v1'; equity: EquityEstimate }
function clampRaise(observation: PlayerObservation, amount: number): Action | null {
  const window = observation.legal.raise;
  if (!window) return null;
  return { kind: 'raiseTo', amount: Math.min(window.max, Math.max(window.min, Math.round(amount))) };
}
function passive(observation: PlayerObservation): Action {
  if (observation.legal.check) return { kind: 'check' };
  if (observation.legal.call !== null) return { kind: 'call' };
  if (observation.legal.fold) return { kind: 'fold' };
  throw new Error('No passive legal action');
}
function foldOrCheck(observation: PlayerObservation): Action { return observation.legal.check ? { kind: 'check' } : { kind: 'fold' }; }
export function chooseAction(observation: PlayerObservation, difficulty: Difficulty, equity: EquityEstimate, random: () => number = Math.random): Action {
  const e = equity.equity, call = observation.legal.call ?? 0, q = potOdds(observation.pot, call) ?? 0;
  const raise = (fraction: number) => clampRaise(observation, observation.highestBet + fraction * (observation.pot + call));
  if (difficulty === 'easy') {
    if (observation.legal.check) return e >= 0.75 && random() < 0.5 ? raise(0.5) ?? passive(observation) : { kind: 'check' };
    return e >= Math.max(0.20, q - 0.10) ? passive(observation) : foldOrCheck(observation);
  }
  if (observation.street === 'preflop' && observation.button === observation.actor && observation.history.length === 0) {
    if (e >= 0.50) return random() < 0.85 ? clampRaise(observation, 250) ?? passive(observation) : passive(observation);
    if (e >= 0.42 && random() < 0.60) return passive(observation);
    return foldOrCheck(observation);
  }
  if (observation.street === 'preflop' && observation.button !== observation.actor && observation.history.length === 1 && observation.history[0]?.action.kind === 'call') {
    return e >= 0.60 && random() < 0.80 ? clampRaise(observation, 400) ?? passive(observation) : passive(observation);
  }
  if (call === 0) {
    if (e >= 0.65 && random() < 0.75) return raise(2 / 3) ?? passive(observation);
    if (e <= 0.35 && random() < 0.10) return raise(2 / 3) ?? passive(observation);
    return passive(observation);
  }
  if (e >= Math.max(0.72, q + 0.20) && random() < 0.70) {
    const target = observation.street === 'preflop' ? observation.highestBet * 3 : observation.highestBet + (2 / 3) * (observation.pot + call);
    return clampRaise(observation, target) ?? passive(observation);
  }
  if (e >= q + 0.08) return passive(observation);
  if (e >= q + 0.03 && random() < 0.5) return passive(observation);
  return foldOrCheck(observation);
}
export async function decide(observation: PlayerObservation, difficulty: Difficulty, options: { random?: () => number; signal?: AbortSignal; deadline?: number } = {}): Promise<BotDecision> {
  const equity = await estimateEquity(observation, { samples: difficulty === 'standard' ? 2048 : 512, random: options.random, signal: options.signal, deadline: options.deadline });
  return { action: chooseAction(observation, difficulty, equity, options.random), botVersion: BOT_VERSIONS[difficulty], equity };
}
