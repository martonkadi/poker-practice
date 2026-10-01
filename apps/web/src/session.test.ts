import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { deleteLocal, GUEST_OWNER, listHands, loadActive, pendingSync } from '@poker/persistence';
import { frame, handIdentity, isSettled, restoreState } from '@poker/poker';
import { actAndSave, dealNext } from './session';

afterEach(() => deleteLocal(GUEST_OWNER));
it('saves three full hands with stable session identity, alternating positions and recoverable states', async () => {
  let active = await dealNext(null);
  const started = active.startedAt, id = active.id;
  for (let hand = 0; hand < 3; hand++) {
    expect(handIdentity(active.state).button).toBe(hand % 2 ? 'bot' : 'hero');
    active = await actAndSave(active, { kind: 'raiseTo', amount: 300 });
    while (!isSettled(active.state)) {
      const legal = frame(active.state).legal!;
      active = await actAndSave(active, legal.check ? { kind: 'check' } : { kind: 'call' });
      expect(restoreState((await loadActive(GUEST_OWNER))!.state).activeSnapshot).toEqual(active.state.activeSnapshot);
    }
    if (hand < 2) active = await dealNext(active);
  }
  const records = (await listHands(GUEST_OWNER)).sort((a, b) => a.sequence - b.sequence);
  expect(records.map(r => r.sequence)).toEqual([0, 1, 2]);
  expect(records.every(r => r.sessionId === id && r.sessionStartedAt === started && r.reachedShowdown)).toBe(true);
  expect(records[0]!.decisions[1]!.amount).toBe(200);
  expect(await pendingSync(GUEST_OWNER)).toEqual([]);
});
it('records an all-in shortcut used to call as a call with its actual contribution', async () => {
  let active = await dealNext(null);
  active = await actAndSave(active, { kind: 'raiseTo', amount: 10_000 });
  active = await actAndSave(active, { kind: 'raiseTo', amount: 10_000 });
  const record = (await listHands(GUEST_OWNER))[0]!;
  expect(record.decisions.map(d => d.action)).toEqual([{ kind: 'raiseTo', amount: 10_000 }, { kind: 'call' }]);
  expect(record.decisions.map(d => d.amount)).toEqual([9950, 9900]);
  expect(isSettled(active.state)).toBe(true);
});
