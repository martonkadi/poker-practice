import type { Card, PlayerObservation } from '@poker/contracts';

function ranks(cards: readonly Card[]): number[] { return cards.map(c => c % 13 + 2); }

function straightHigh(values: readonly number[]): number {
  const unique = new Set(values);
  if (unique.has(14)) unique.add(1);
  for (let hi = 14; hi >= 5; hi--) if ([hi, hi - 1, hi - 2, hi - 3, hi - 4].every(x => unique.has(x))) return hi;
  return 0;
}
function scoreFive(cards: readonly Card[]): number {
  const r = ranks(cards);
  const counts = new Map<number, number>();
  for (const x of r) counts.set(x, (counts.get(x) ?? 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every(x => Math.floor(x / 13) === Math.floor(cards[0]! / 13));
  const straight = straightHigh(r);
  let category: number;
  let kickers: number[];
  if (flush && straight) { category = 8; kickers = [straight]; }
  else if (groups[0]![1] === 4) { category = 7; kickers = [groups[0]![0], groups[1]![0]]; }
  else if (groups[0]![1] === 3 && groups[1]![1] === 2) { category = 6; kickers = [groups[0]![0], groups[1]![0]]; }
  else if (flush) { category = 5; kickers = [...r].sort((a, b) => b - a); }
  else if (straight) { category = 4; kickers = [straight]; }
  else if (groups[0]![1] === 3) { category = 3; kickers = [groups[0]![0], ...groups.slice(1).map(x => x[0]).sort((a, b) => b - a)]; }
  else if (groups[0]![1] === 2 && groups[1]![1] === 2) { category = 2; kickers = [Math.max(groups[0]![0], groups[1]![0]), Math.min(groups[0]![0], groups[1]![0]), groups[2]![0]]; }
  else if (groups[0]![1] === 2) { category = 1; kickers = [groups[0]![0], ...groups.slice(1).map(x => x[0]).sort((a, b) => b - a)]; }
  else { category = 0; kickers = [...r].sort((a, b) => b - a); }
  return kickers.reduce((score, x, i) => score + x * 15 ** (4 - i), category * 15 ** 5);
}
export function scoreSeven(cards: readonly Card[]): number {
  if (cards.length !== 7 || new Set(cards).size !== 7) throw new Error('Expected seven distinct cards');
  let best = -1;
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 4; b++) for (let c = b + 1; c < 5; c++)
    for (let d = c + 1; d < 6; d++) for (let e = d + 1; e < 7; e++) best = Math.max(best, scoreFive([cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!]));
  return best;
}
export interface EquityEstimate { equity: number; wins: number; ties: number; losses: number; samples: number; range: 'uniform-legal-hands' }
export interface EquityOptions { samples: number; random?: () => number; signal?: AbortSignal; deadline?: number }
export async function estimateEquity(observation: Pick<PlayerObservation, 'hole' | 'board'>, options: EquityOptions): Promise<EquityEstimate> {
  const known = [...observation.hole, ...observation.board];
  if (new Set(known).size !== known.length || observation.board.length > 5) throw new Error('Invalid equity cards');
  const rest = Array.from({ length: 52 }, (_, i) => i).filter(x => !known.includes(x));
  const count = Math.max(1, Math.floor(options.samples));
  const random = options.random ?? Math.random;
  let wins = 0, ties = 0, losses = 0, samples = 0;
  const drawCount = 2 + 5 - observation.board.length;
  for (let i = 0; i < count; i++) {
    if (options.signal?.aborted || (options.deadline && performance.now() >= options.deadline)) break;
    const pool = rest.slice();
    for (let j = 0; j < drawCount; j++) {
      const k = j + Math.floor(random() * (pool.length - j));
      [pool[j], pool[k]] = [pool[k]!, pool[j]!];
    }
    const opponent = [pool[0]!, pool[1]!];
    const board = [...observation.board, ...pool.slice(2, drawCount)];
    const heroScore = scoreSeven([...observation.hole, ...board]);
    const otherScore = scoreSeven([...opponent, ...board]);
    if (heroScore > otherScore) wins++; else if (heroScore === otherScore) ties++; else losses++;
    samples++;
    if (i % 64 === 63) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  if (!samples) throw new Error('Equity estimation was cancelled');
  return { equity: (wins + ties / 2) / samples, wins, ties, losses, samples, range: 'uniform-legal-hands' };
}
export function potOdds(pot: number, callAmount: number): number | null { return callAmount > 0 ? callAmount / (pot + callAmount) : null; }
