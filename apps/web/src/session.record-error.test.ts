import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import type { ActiveSession } from '@poker/persistence';
import { deleteLocal, GUEST_OWNER, listHands, loadActive, pendingSync, saveActive, saveCompleted } from '@poker/persistence';
import { applyAction, frame, RecordError } from '@poker/poker';
import { actAndSave, dealNext } from './session';

// Real engine and store, with applyAction and the two writers wrapped so the test can craft
// an after-state with no new actor turn and observe whether any write was attempted.
vi.mock('@poker/poker', async importOriginal => {
  const real = await importOriginal<typeof import('@poker/poker')>();
  return { ...real, applyAction: vi.fn(real.applyAction) };
});
vi.mock('@poker/persistence', async importOriginal => {
  const real = await importOriginal<typeof import('@poker/persistence')>();
  return { ...real, saveActive: vi.fn(real.saveActive), saveCompleted: vi.fn(real.saveCompleted) };
});

afterEach(async () => { vi.clearAllMocks(); await deleteLocal(GUEST_OWNER); });

it('saves nothing and reports "This action could not be recorded." when the after-state has no new actor turn', async () => {
  const active = await dealNext(null);
  const persistedBefore = await loadActive(GUEST_OWNER);
  vi.mocked(saveActive).mockClear();
  // Crafted pair: the "after" state is the unchanged before-state, so the actor has no new history entry.
  vi.mocked(applyAction).mockImplementationOnce(async (state: ActiveSession['state']) => state);

  const error = await actAndSave(active, { kind: 'call' }).catch((e: unknown) => e);

  expect(error).toBeInstanceOf(RecordError);
  // useGame displays error.message, so this is the text the player sees.
  expect((error as Error).message).toBe('This action could not be recorded.');
  expect(saveActive).not.toHaveBeenCalled();
  expect(saveCompleted).not.toHaveBeenCalled();
  expect(await loadActive(GUEST_OWNER)).toEqual(persistedBefore);
  expect(await listHands(GUEST_OWNER)).toEqual([]);
  expect(await pendingSync(GUEST_OWNER)).toEqual([]);
  // The in-memory session the caller holds is untouched.
  expect(active.decisions).toEqual([]);
  expect(frame(active.state).actor).toBe('hero');
});
