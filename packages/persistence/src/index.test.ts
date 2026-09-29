import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { HandRecord } from '@poker/contracts';
import { acknowledgeBookmark, cacheCloudHands, deleteLocal, exportHands, getHand, importHands, listHands, pendingBookmarks, pendingSync, reconcileCloudBookmarks, setBookmark } from './index';

function hand(): HandRecord {
  const now = new Date().toISOString();
  return { schemaVersion: 1, engineVersion: 'fixture', botVersion: 'standard-v1', id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(), sessionStartedAt: now, sequence: 0, completedAt: now,
    button: 'hero', difficulty: 'standard', initialHeroHole: [0, 1], botHole: null,
    finalBoard: [], decisions: [], heroNet: -50, reachedShowdown: false,
    heroWonShowdown: false, bookmarked: false };
}
function bundle(records: unknown[]): string { return JSON.stringify({ format: 'poker-practice', schemaVersion: 1, hands: records }); }

describe('local persistence boundaries', () => {
  it('validates imports, deduplicates IDs and isolates accounts', async () => {
    const a = crypto.randomUUID(), b = crypto.randomUUID(), record = hand();
    try {
      expect(await importHands(a, bundle([record]))).toEqual({ imported: 1, duplicates: 0 });
      expect(await importHands(a, bundle([record]))).toEqual({ imported: 0, duplicates: 1 });
      expect(await getHand(b, record.id)).toBeUndefined();
      expect((await listHands(a)).map(x => x.id)).toEqual([record.id]);
      expect((await pendingSync(a)).map(x => x.id)).toEqual([record.id]);
      await expect(importHands(a, bundle([{ ...record, initialHeroHole: [0, 0] }]))).rejects.toThrow();
      await expect(importHands(a, bundle([{ ...record, id: crypto.randomUUID(), initialHeroHole: [99, 0] }]))).rejects.toThrow();
      await expect(importHands(a, 'x'.repeat(20_000_001))).rejects.toThrow('20 MB');
      const exported = JSON.parse(await exportHands(a));
      expect(exported.schemaVersion).toBe(1);
      expect(exported.hands).toHaveLength(1);
      await importHands(b, bundle([record]));
      await deleteLocal(a);
      expect(await getHand(a, record.id)).toBeUndefined();
      expect(await getHand(b, record.id)).toBeDefined();
    } finally { await deleteLocal(a); await deleteLocal(b); }
  });

  it('caches cloud history without queuing another upload', async () => {
    const owner = crypto.randomUUID(), record = hand();
    try {
      await cacheCloudHands(owner, [record]);
      expect(await getHand(owner, record.id)).toEqual(record);
      expect(await pendingSync(owner)).toEqual([]);
    } finally { await deleteLocal(owner); }
  });

  it('keeps synchronized hand records immutable while bookmarks wait offline', async () => {
    const owner = crypto.randomUUID(), other = crypto.randomUUID(), record = hand();
    try {
      await importHands(owner, bundle([record]));
      await setBookmark(owner, record.id, true);
      expect((await getHand(owner, record.id))?.bookmarked).toBe(true);
      expect((await pendingSync(owner))[0]?.bookmarked).toBe(false);
      expect((await pendingBookmarks(owner)).map(x => x.handId)).toEqual([record.id]);
      await reconcileCloudBookmarks(owner, []);
      expect((await getHand(owner, record.id))?.bookmarked).toBe(true);
      await acknowledgeBookmark(owner, record.id, true);
      expect(await pendingBookmarks(owner)).toEqual([]);
      await reconcileCloudBookmarks(owner, [record.id]);
      expect((await getHand(owner, record.id))?.bookmarked).toBe(true);
      await setBookmark(owner, record.id, false);
      expect((await pendingBookmarks(owner))[0]?.bookmarked).toBe(false);
      expect((await getHand(other, record.id))).toBeUndefined();
      const exported = JSON.parse(await exportHands(owner));
      expect(exported.hands[0].bookmarked).toBe(false);
    } finally { await deleteLocal(owner); await deleteLocal(other); }
  });
});
