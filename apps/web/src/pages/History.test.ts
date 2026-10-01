// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { HandRecord } from '@poker/contracts';
import { db, deleteLocal, getPreference, GUEST_OWNER, importHands, putPreference } from '@poker/persistence';
import { ChipUnitProvider } from '../chipUnit';
import { StoreStatusProvider } from '../storeStatus';
import { History } from './History';

// Real store (fake-indexeddb); the preference calls are wrapped so a test can fail the load
// and check that nothing was written.
vi.mock('@poker/persistence', async importOriginal => {
  const real = await importOriginal<typeof import('@poker/persistence')>();
  return { ...real, getPreference: vi.fn(real.getPreference), putPreference: vi.fn(real.putPreference) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function hand(heroNet: number, minute: number): HandRecord {
  const at = new Date(Date.UTC(2025, 0, 1, 12, minute)).toISOString();
  return { schemaVersion: 1, engineVersion: 'fixture', botVersion: 'standard-v1', id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(), sessionStartedAt: at, sequence: 0, completedAt: at,
    button: 'hero', difficulty: 'standard', initialHeroHole: [0, 1], botHole: null,
    finalBoard: [], decisions: [], heroNet, reachedShowdown: false, heroWonShowdown: false, bookmarked: false };
}
// A win, a loss and a split, so every sign case is shown in chips.
const HANDS = [hand(250, 1), hand(-1250, 2), hand(0, 3)];
const EXPECTED = new Map([[HANDS[0]!.id, '+250 chips'], [HANDS[1]!.id, '\u22121,250 chips'], [HANDS[2]!.id, '0 chips']]);

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if (check()) return;
    await act(tick);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

let container: HTMLDivElement;
let unmount: () => void = () => {};
async function renderHistory(): Promise<void> {
  container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(createElement(StoreStatusProvider, null,
    createElement(ChipUnitProvider, null, createElement(MemoryRouter, { initialEntries: ['/history'] }, createElement(History))))));
  unmount = () => act(() => root.unmount());
  // Wait for the preference load to settle, then for the hand list.
  await until(() => vi.mocked(getPreference).mock.results.length > 0, 'preference load');
  await act(async () => { await (vi.mocked(getPreference).mock.results[0]!.value as Promise<unknown>).catch(() => {}); });
  await until(() => container.querySelectorAll('article').length > 0, 'hand rows');
  await act(tick);
}
/** Hand id (from the review link) → displayed result, for every listed row. */
function rows(): Map<string, string> {
  return new Map([...container.querySelectorAll('article')].map(row => {
    const href = row.querySelector('a')!.getAttribute('href')!;
    return [href.replace('/review/', ''), row.querySelector(':scope > strong')!.textContent!];
  }));
}

beforeEach(async () => {
  await deleteLocal(GUEST_OWNER);
  await importHands(GUEST_OWNER, JSON.stringify({ format: 'poker-practice', schemaVersion: 1, hands: HANDS }));
  vi.mocked(getPreference).mockClear();
  vi.mocked(putPreference).mockClear();
});
afterEach(async () => {
  unmount();
  await deleteLocal(GUEST_OWNER);
});

it('shows chips and lists every hand when no preference is stored, without writing one (Req 7.3)', async () => {
  expect(await db.preferences.toArray()).toEqual([]);
  await renderHistory();
  expect(rows()).toEqual(EXPECTED);
  expect(putPreference).not.toHaveBeenCalled();
  expect(await db.preferences.toArray()).toEqual([]);
});

it('shows chips and lists every hand when the preference cannot be loaded, leaving it unchanged (Req 7.3)', async () => {
  const stored = { owner: GUEST_OWNER, chipsAsBb: true, animationSpeed: 'fast' as const };
  await db.preferences.put(stored);
  vi.mocked(getPreference).mockRejectedValueOnce(new Error('read failed'));
  await renderHistory();
  expect(rows()).toEqual(EXPECTED);
  expect(putPreference).not.toHaveBeenCalled();
  expect(await db.preferences.toArray()).toEqual([stored]);
});
