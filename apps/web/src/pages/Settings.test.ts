// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { handRecordSchema, type HandRecord } from '@poker/contracts';
import { db, deleteLocal, exportHands, GUEST_OWNER, importHands, listHands, setBookmark, type ActiveSession } from '@poker/persistence';
import { ChipUnitProvider, useChipUnit } from '../chipUnit';
import { StoreStatusProvider } from '../storeStatus';
import { DELETE_CONFIRM_MESSAGE, DELETE_FAILED_MESSAGE, DELETE_LOCKED_MESSAGE, EXPORT_FAILED_MESSAGE, Settings } from './Settings';

// Real store (fake-indexeddb); export and delete are wrapped so a test can make one call fail.
vi.mock('@poker/persistence', async importOriginal => {
  const real = await importOriginal<typeof import('@poker/persistence')>();
  return { ...real, exportHands: vi.fn(real.exportHands), deleteLocal: vi.fn(real.deleteLocal) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Minimal same-page LockManager (happy-dom has none): exclusive locks with `ifAvailable`. */
class FakeLocks {
  private held = new Set<string>();
  async request<T>(name: string, options: { ifAvailable?: boolean }, callback: (lock: { name: string } | null) => Promise<T>): Promise<T> {
    if (this.held.has(name)) {
      if (options.ifAvailable) return callback(null);
      throw new Error('FakeLocks only supports ifAvailable for held locks');
    }
    this.held.add(name);
    try { return await callback({ name }); } finally { this.held.delete(name); }
  }
}

function hand(minute: number): HandRecord {
  const at = new Date(Date.UTC(2025, 0, 1, 12, minute)).toISOString();
  return { schemaVersion: 1, engineVersion: 'fixture', botVersion: 'standard-v1', id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(), sessionStartedAt: at, sequence: 0, completedAt: at,
    button: 'hero', difficulty: 'standard', initialHeroHole: [0, 1], botHole: null,
    finalBoard: [], decisions: [], heroNet: 100 * minute, reachedShowdown: false, heroWonShowdown: false, bookmarked: false };
}
const HANDS = [hand(1), hand(2)];
const PREFERENCE = { owner: GUEST_OWNER, chipsAsBb: true, animationSpeed: 'normal' as const };

/** Everything the guest has stored, for before/after comparisons. */
async function snapshot() {
  return { hands: await db.hands.toArray(), bookmarks: await db.bookmarks.toArray(), active: await db.active.toArray(), preferences: await db.preferences.toArray() };
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if (check()) return;
    await act(tick);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function UnitProbe() {
  return createElement('output', { 'data-testid': 'unit' }, useChipUnit().unit);
}

let container: HTMLDivElement;
let unmount: () => void = () => {};
let locks: FakeLocks;
// happy-dom has no window.confirm; each test chooses the guest's answer.
const confirmMock = vi.fn<(message?: string) => boolean>();
const text = () => container.textContent ?? '';
const unit = () => container.querySelector('[data-testid="unit"]')!.textContent;
function button(name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(b => b.textContent === name);
  if (!found) throw new Error(`No button ${name}`);
  return found;
}
async function renderSettings(): Promise<void> {
  container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(createElement(StoreStatusProvider, null, createElement(ChipUnitProvider, null,
    createElement(MemoryRouter, { initialEntries: ['/settings'] },
      createElement(UnitProbe),
      createElement(Routes, null,
        createElement(Route, { path: '/settings', element: createElement(Settings) }),
        createElement(Route, { path: '/', element: createElement('h1', null, 'Home page') })))))));
  unmount = () => act(() => root.unmount());
  // Store open and the stored "bb" preference load, so the reset to chips is observable.
  await until(() => !button('Delete local data').disabled && unit() === 'bb', 'store ready and preference loaded');
}
async function click(name: string): Promise<void> {
  await act(async () => { button(name).click(); });
  await act(tick);
}

beforeEach(async () => {
  locks = new FakeLocks();
  confirmMock.mockReset();
  Object.defineProperty(window, 'confirm', { value: confirmMock, configurable: true, writable: true });
  Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
  await deleteLocal(GUEST_OWNER);
  await importHands(GUEST_OWNER, JSON.stringify({ format: 'poker-practice', schemaVersion: 1, hands: HANDS }));
  await setBookmark(GUEST_OWNER, HANDS[0]!.id, true);
  await db.active.put({ id: 'session-1', owner: GUEST_OWNER, state: {}, difficulty: 'standard', nextSequence: 2, decisions: [], startedAt: HANDS[0]!.sessionStartedAt } as unknown as ActiveSession);
  await db.preferences.put(PREFERENCE);
  vi.mocked(exportHands).mockClear();
  vi.mocked(deleteLocal).mockClear();
});
afterEach(async () => {
  unmount();
  vi.restoreAllMocks();
  await deleteLocal(GUEST_OWNER);
});

it('states there is no account or cloud backup and that clearing browser data deletes saved hands (Req 6.9)', async () => {
  await renderSettings();
  expect(text()).toContain('There is no account or cloud backup');
  expect(text()).toContain('Clearing browser data deletes your saved hands');
});

it('exports every saved hand as one poker-practice v1 file (Req 6.1)', async () => {
  const blobs: Blob[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => { blobs.push(blob as Blob); return 'blob:export'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await renderSettings();
  await click('Export JSON');
  await until(() => clicks.mock.calls.length > 0, 'download click');
  expect(clicks).toHaveBeenCalledTimes(1);
  expect(blobs).toHaveLength(1);
  const archive = JSON.parse(await blobs[0]!.text()) as { format: string; schemaVersion: number; hands: unknown[] };
  expect(archive.format).toBe('poker-practice');
  expect(archive.schemaVersion).toBe(1);
  expect(archive.hands.map(h => handRecordSchema.parse(h))).toEqual(await listHands(GUEST_OWNER));
  expect(text()).not.toContain(EXPORT_FAILED_MESSAGE);
});

it('downloads nothing and keeps the data when the export fails (Req 6.8)', async () => {
  const objectUrls = vi.spyOn(URL, 'createObjectURL');
  const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.mocked(exportHands).mockRejectedValueOnce(new Error('read failed'));
  const before = await snapshot();
  await renderSettings();
  await click('Export JSON');
  await until(() => text().includes(EXPORT_FAILED_MESSAGE), 'export failure message');
  expect(objectUrls).not.toHaveBeenCalled();
  expect(clicks).not.toHaveBeenCalled();
  expect(await snapshot()).toEqual(before);
});

it('asks for confirmation and keeps everything when the guest cancels (Req 6.3, 6.5)', async () => {
  const confirm = confirmMock.mockReturnValue(false);
  const before = await snapshot();
  await renderSettings();
  await click('Delete local data');
  expect(confirm).toHaveBeenCalledWith(DELETE_CONFIRM_MESSAGE);
  expect(deleteLocal).not.toHaveBeenCalled();
  expect(await snapshot()).toEqual(before);
  expect(text()).toContain('Settings');
  expect(text()).not.toContain('Home page');
  expect(unit()).toBe('bb');
});

it('keeps the data and asks to close the other tab when another tab holds the lock (Req 6.6)', async () => {
  confirmMock.mockReturnValue(true);
  const before = await snapshot();
  await renderSettings();
  let release!: () => void;
  const otherTab = locks.request(`poker-session-${GUEST_OWNER}`, {}, () => new Promise<void>(resolve => { release = resolve; }));
  await click('Delete local data');
  await until(() => text().includes(DELETE_LOCKED_MESSAGE), 'lock message');
  expect(deleteLocal).not.toHaveBeenCalled();
  expect(await snapshot()).toEqual(before);
  expect(text()).not.toContain('Home page');
  release();
  await otherTab;
});

it('stays on Settings with an error when deletion fails (Req 6.7)', async () => {
  confirmMock.mockReturnValue(true);
  vi.mocked(deleteLocal).mockRejectedValueOnce(new Error('transaction aborted'));
  await renderSettings();
  await click('Delete local data');
  await until(() => text().includes(DELETE_FAILED_MESSAGE), 'deletion failure message');
  expect(text()).not.toContain('Home page');
  expect(button('Delete local data').disabled).toBe(false);
  expect(unit()).toBe('bb');
});

it('deletes hands, bookmarks, the active session and the chip preference, resets to chips and goes home (Req 6.4)', async () => {
  confirmMock.mockReturnValue(true);
  await renderSettings();
  await click('Delete local data');
  await until(() => text().includes('Home page'), 'home page');
  expect(await snapshot()).toEqual({ hands: [], bookmarks: [], active: [], preferences: [] });
  expect(unit()).toBe('chips');
});
