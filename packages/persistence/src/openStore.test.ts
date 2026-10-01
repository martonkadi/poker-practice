import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { PracticeDatabase, openStore } from './index';

describe('openStore', () => {
  it('returns ok when the store opens', async () => {
    const database = new PracticeDatabase(`open-ok-${crypto.randomUUID()}`);
    try {
      expect(await openStore(database)).toEqual({ ok: true });
      expect(database.isOpen()).toBe(true);
    } finally { await database.delete(); }
  });

  it('returns a reason and leaves data unmodified when an upgrade fails', async () => {
    const name = `open-fail-${crypto.randomUUID()}`;
    const v1 = new Dexie(name);
    v1.version(1).stores({ items: 'id' });
    await v1.table('items').put({ id: 'a', value: 1 });
    v1.close();

    const broken = new Dexie(name);
    broken.version(1).stores({ items: 'id' });
    broken.version(2).stores({ items: 'id' }).upgrade(async tx => {
      await tx.table('items').put({ id: 'a', value: 2 });
      throw new Error('forced upgrade failure');
    });
    const status = await openStore(broken);
    expect(status.ok).toBe(false);
    if (!status.ok) expect(status.reason).toContain('forced upgrade failure');
    broken.close();

    const reopened = new Dexie(name);
    reopened.version(1).stores({ items: 'id' });
    try {
      expect(await reopened.table('items').toArray()).toEqual([{ id: 'a', value: 1 }]);
    } finally { await reopened.delete(); }
  });
});
