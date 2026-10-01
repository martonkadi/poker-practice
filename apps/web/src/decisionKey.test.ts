import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { deleteLocal, GUEST_OWNER, loadActive } from '@poker/persistence';
import { restoreState } from '@poker/poker';
import { decisionKey } from './decisionKey';
import { actAndSave, dealNext } from './session';

afterEach(() => deleteLocal(GUEST_OWNER));

it('keeps the same key when the same saved state is re-read as a new object', async () => {
  const dealt = await dealNext(null);
  const saved = (await loadActive(GUEST_OWNER))!;
  const reread = { ...saved, state: restoreState(saved.state) };
  expect(reread).not.toBe(dealt);
  expect(decisionKey(reread)).toBe(decisionKey(dealt));
});

it('changes the key after an action and after a new deal', async () => {
  const dealt = await dealNext(null);
  const acted = await actAndSave(dealt, { kind: 'call' });
  expect(decisionKey(acted)).not.toBe(decisionKey(dealt));
  const raised = await actAndSave(acted, { kind: 'raiseTo', amount: 400 });
  const settled = await actAndSave(raised, { kind: 'fold' });
  const next = await dealNext(settled);
  expect(new Set([dealt, acted, raised, settled, next].map(decisionKey)).size).toBe(5);
  expect(decisionKey(null)).toBeNull();
});
