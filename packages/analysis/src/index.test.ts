import { describe, expect, it } from 'vitest';
import { scoreSeven, estimateEquity, potOdds } from './index';
import { textToCard } from '@poker/contracts';
const cards = (...values: string[]) => values.map(textToCard);

describe('equity and hand evaluator', () => {
  it('orders hand classes and splits board ties', async () => {
    const straightFlush = scoreSeven(cards('As', 'Ks', 'Qs', 'Js', 'Ts', '2c', '3d'));
    const quads = scoreSeven(cards('Ac', 'Ad', 'Ah', 'As', '2c', '3d', '4h'));
    const fullHouse = scoreSeven(cards('Ac', 'Ad', 'Ah', 'Kc', 'Kd', '3d', '4h'));
    expect(straightFlush).toBeGreaterThan(quads);
    expect(quads).toBeGreaterThan(fullHouse);
    const estimate = await estimateEquity({ hole: [textToCard('2c'), textToCard('3d')], board: cards('As', 'Ks', 'Qs', 'Js', 'Ts') }, { samples: 20, random: () => 0.37 });
    expect(estimate.equity).toBe(0.5);
    expect(estimate.ties).toBe(20);
  });
  it('calculates exact pot odds', () => { expect(potOdds(300, 100)).toBe(0.25); expect(potOdds(300, 0)).toBeNull(); });
});
