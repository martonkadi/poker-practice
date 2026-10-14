// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db, deleteLocal, getPreference, GUEST_OWNER, putPreference } from '@poker/persistence';
import { ChipUnitProvider, PREFERENCE_SAVE_ERROR, useChipUnit } from './chipUnit';
import { StoreStatusProvider, useStoreStatus } from './storeStatus';
import { notifyLocalDeletion, PREFERENCE_LOCK, withPreferenceLock } from './localData';
import { TestLocks } from './testLocks';

vi.mock('@poker/persistence', async original => {
  const real = await original<typeof import('@poker/persistence')>();
  return { ...real, putPreference: vi.fn(real.putPreference), getPreference: vi.fn(real.getPreference) };
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const defer = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise<void>(r => setTimeout(r, 0));
async function until(check: () => boolean) { for (let i = 0; i < 500; i++) { if (check()) return; await act(tick); } throw new Error('Timed out'); }
const roots: Root[] = [];
let locks: TestLocks;
async function mount() {
  let chip!: ReturnType<typeof useChipUnit>;
  let ready = false;
  function Probe() { chip = useChipUnit(); ready = useStoreStatus().writable; return null; }
  const root = createRoot(document.createElement('div')); roots.push(root);
  act(() => root.render(createElement(StoreStatusProvider, null, createElement(ChipUnitProvider, null, createElement(Probe)))));
  await until(() => ready);
  await act(tick);
  return { get chip() { return chip; }, unmount() { act(() => root.unmount()); roots.splice(roots.indexOf(root), 1); } };
}
beforeEach(async () => {
  locks = new TestLocks(); Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
  await deleteLocal(GUEST_OWNER); vi.clearAllMocks();
});
afterEach(async () => { roots.splice(0).forEach(root => act(() => root.unmount())); vi.restoreAllMocks(); await deleteLocal(GUEST_OWNER); });

it('drains older writes before deletion across two providers, ten times', async () => {
  const real = await vi.importActual<typeof import('@poker/persistence')>('@poker/persistence');
  for (let repeat = 0; repeat < 10; repeat++) {
    const a = await mount(), b = await mount(), gate = defer(), started = defer();
    vi.mocked(putPreference).mockImplementationOnce(async pref => { started.resolve(); await gate.promise; await real.putPreference(pref); });
    act(() => a.chip.setUnit('bb')); await started.promise;
    act(() => { b.chip.setUnit('chips'); b.chip.setUnit('bb'); });
    let deleted = false;
    const deletion = withPreferenceLock(async () => { await deleteLocal(GUEST_OWNER); deleted = true; });
    await act(tick); expect(deleted).toBe(false);
    gate.resolve(); await act(async () => { await deletion; a.chip.resetUnit(); notifyLocalDeletion(); });
    await until(() => b.chip.unit === 'chips');
    expect(await db.preferences.count()).toBe(0);
    a.unmount(); b.unmount();
  }
});

it('ignores an older failure after a newer choice and preserves unrelated preferences', async () => {
  await db.preferences.put({ owner: GUEST_OWNER, chipsAsBb: false, animationSpeed: 'fast' });
  const a = await mount(), gate = defer(), started = defer();
  vi.mocked(putPreference).mockImplementationOnce(async () => { started.resolve(); await gate.promise; throw new Error('old failure'); });
  act(() => a.chip.setUnit('chips')); await started.promise;
  act(() => a.chip.setUnit('bb')); gate.resolve();
  await until(() => vi.mocked(putPreference).mock.calls.length === 2);
  await act(tick);
  expect(a.chip.error).toBeNull(); expect(a.chip.unit).toBe('bb');
  expect(await db.preferences.get(GUEST_OWNER)).toEqual({ owner: GUEST_OWNER, chipsAsBb: true, animationSpeed: 'fast' });
});

it('does not let an older success hide the latest failure', async () => {
  const real = await vi.importActual<typeof import('@poker/persistence')>('@poker/persistence');
  const a = await mount(), gate = defer(), started = defer();
  vi.mocked(putPreference).mockImplementationOnce(async pref => { started.resolve(); await gate.promise; await real.putPreference(pref); });
  act(() => a.chip.setUnit('chips')); await started.promise;
  vi.mocked(putPreference).mockRejectedValueOnce(new Error('latest failure'));
  act(() => a.chip.setUnit('bb')); gate.resolve();
  await until(() => a.chip.error === PREFERENCE_SAVE_ERROR);
  expect(a.chip.unit).toBe('bb');
});

it('cancels superseded waiting writes and pending writes on unmount', async () => {
  const a = await mount(), gate = defer(), started = defer();
  const blocker = locks.request(PREFERENCE_LOCK, {}, async () => { started.resolve(); await gate.promise; }); await started.promise;
  act(() => { a.chip.setUnit('bb'); a.chip.setUnit('chips'); });
  a.unmount(); gate.resolve(); await blocker; await act(tick);
  expect(putPreference).not.toHaveBeenCalled(); expect(await db.preferences.count()).toBe(0);
});

it('does not apply a slow boot preference over a newer choice', async () => {
  const gate = defer(); vi.mocked(getPreference).mockImplementationOnce(async () => { await gate.promise; return { owner: GUEST_OWNER, chipsAsBb: false, animationSpeed: 'normal' }; });
  const a = await mount(); act(() => a.chip.setUnit('bb')); gate.resolve();
  await until(() => vi.mocked(putPreference).mock.calls.length > 0); await act(tick);
  expect(a.chip.unit).toBe('bb');
});

it('ignores a deletion reconciliation when a newer local choice is waiting', async () => {
  const a = await mount(), gate = defer(), started = defer();
  vi.mocked(getPreference).mockImplementationOnce(async () => { started.resolve(); await gate.promise; return { owner: GUEST_OWNER, chipsAsBb: false, animationSpeed: 'normal' }; });
  act(() => notifyLocalDeletion()); await started.promise;
  act(() => a.chip.setUnit('bb')); gate.resolve();
  await until(() => vi.mocked(putPreference).mock.calls.length > 0); await act(tick);
  expect(a.chip.unit).toBe('bb'); expect(a.chip.error).toBeNull();
});

it('cancels a preference load still waiting for a lock when the provider unmounts', async () => {
  const gate = defer(), started = defer();
  const blocker = locks.request(PREFERENCE_LOCK, {}, async () => { started.resolve(); await gate.promise; }); await started.promise;
  const a = await mount(); a.unmount(); gate.resolve(); await blocker; await act(tick);
  expect(getPreference).not.toHaveBeenCalled();
});
