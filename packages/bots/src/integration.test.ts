import { describe, expect, it } from 'vitest';
import { applyAction, createHand, frame, isSettled, observe } from '@poker/poker';
import { estimateEquity } from '@poker/analysis';
import { chooseAction } from './index';

function rng(seed: number): () => number {
  let value = seed >>> 0;
  return () => { value ^= value << 13; value ^= value >>> 17; value ^= value << 5; return (value >>> 0) / 2 ** 32; };
}

describe('bot and engine integration', () => {
  it('finishes 100 hands with only legal actions and conserved chips', async () => {
    for (let i = 1; i <= 100; i++) {
      const random = rng(i * 7919);
      let state = await createHand(i % 2 ? 'hero' : 'bot', random);
      for (let step = 0; step < 40 && !isSettled(state); step++) {
        const actor = frame(state).actor!;
        const observation = observe(state, actor);
        const equity = await estimateEquity(observation, { samples: 16, random });
        const action = chooseAction(observation, actor === 'hero' ? 'standard' : 'easy', equity, random);
        state = await applyAction(state, actor, action);
        const f = frame(state);
        expect(f.stacks.hero + f.stacks.bot + f.pot).toBe(20_000);
      }
      expect(isSettled(state)).toBe(true);
    }
  }, 60_000);
});
