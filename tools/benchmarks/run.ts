import { performance } from 'node:perf_hooks';
import { createHand, frame, isSettled, observe, applyAction, result } from '../../packages/poker/src/index.ts';
import { estimateEquity } from '../../packages/analysis/src/index.ts';
import { chooseAction } from '../../packages/bots/src/index.ts';
import type { Action, PlayerObservation } from '../../packages/contracts/src/index.ts';

function option(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name}`);
  return value;
}
const deals = option('--deals', 10_000);
const standardSamples = option('--samples-standard', 2048);
const easySamples = option('--samples-easy', 512);
const seedBase = option('--seed', 8_921_369); // Holdout seed; do not tune policies on it.
function rng(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 2 ** 32; };
}
type Opponent = 'easy' | 'always-call' | 'random-legal';
function baseline(observation: PlayerObservation, opponent: Opponent, random: () => number): Action {
  const legal = observation.legal;
  if (opponent === 'always-call') return legal.check ? { kind: 'check' } : legal.call !== null ? { kind: 'call' } : { kind: 'fold' };
  const options: Action[] = [];
  if (legal.fold) options.push({ kind: 'fold' });
  if (legal.check) options.push({ kind: 'check' });
  if (legal.call !== null) options.push({ kind: 'call' });
  if (legal.raise) { options.push({ kind: 'raiseTo', amount: legal.raise.min }); options.push({ kind: 'raiseTo', amount: legal.raise.max }); }
  if (!options.length) throw new Error('No legal baseline action');
  return options[Math.floor(random() * options.length)]!;
}
async function play(seed: number, button: 'hero' | 'bot', opponent: Opponent, latencies: number[]): Promise<number> {
  const random = rng(seed);
  let state = await createHand(button, random);
  for (let step = 0; step < 50 && !isSettled(state); step++) {
    const actor = frame(state).actor!;
    const observation = observe(state, actor);
    let action: Action;
    const started = performance.now();
    if (actor === 'hero' || opponent === 'easy') {
      const difficulty = actor === 'hero' ? 'standard' : 'easy';
      const equity = await estimateEquity(observation, { samples: difficulty === 'standard' ? standardSamples : easySamples, random });
      action = chooseAction(observation, difficulty, equity, random);
    } else action = baseline(observation, opponent, random);
    latencies.push(performance.now() - started);
    state = await applyAction(state, actor, action); // Throws on illegal policy output.
  }
  if (!isSettled(state)) throw new Error(`Hand did not settle: seed ${seed}`);
  return result(state).heroNet / 100;
}
function report(values: number[]) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / Math.max(1, n - 1);
  const se = Math.sqrt(variance / n);
  // One paired deal contains two hands, so its bb/100 contribution is 50× pair net bb.
  return { bbPer100: mean * 50, lower95: (mean - 1.96 * se) * 50, upper95: (mean + 1.96 * se) * 50 };
}
for (const opponent of ['easy', 'always-call', 'random-legal'] as const) {
  const paired: number[] = [];
  const latencies: number[] = [];
  for (let i = 0; i < deals; i++) {
    const seed = (seedBase + i * 7919) >>> 0;
    const first = await play(seed, 'hero', opponent, latencies);
    const swapped = await play(seed, 'bot', opponent, latencies);
    paired.push(first + swapped);
    if ((i + 1) % 1000 === 0) process.stderr.write(`${opponent}: ${i + 1}/${deals} paired deals\n`);
  }
  latencies.sort((a, b) => a - b);
  console.log(JSON.stringify({ opponent, pairedDeals: deals, hands: deals * 2, standardSamples, easySamples, illegalActions: 0,
    ...report(paired), p95DecisionMs: latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)] }, null, 2));
}
