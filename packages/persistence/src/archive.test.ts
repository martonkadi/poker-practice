import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, expect, it, vi } from 'vitest';
import type { HandRecord } from '@poker/contracts';
import { db, deleteLocal, exportHands, exportHandsBlob, getHandsPage, importHands, listHands, setBookmark } from './index';

const owner = 'archive-test', other = 'archive-other';
function hand(i: number): HandRecord {
  const at = new Date(Date.UTC(2025, 0, 1) + Math.floor(i / 3) * 1000).toISOString();
  return { schemaVersion: 1, engineVersion: 'fixture', botVersion: 'standard-v1', id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    sessionId: '00000000-0000-4000-8000-000000000000', sessionStartedAt: at, sequence: i, completedAt: at,
    button: 'hero', difficulty: 'standard', initialHeroHole: [0, 1], botHole: null, finalBoard: [], decisions: [], heroNet: 0,
    reachedShowdown: false, heroWonShowdown: false, bookmarked: false };
}
const bundle = (hands: HandRecord[]) => JSON.stringify({ format: 'poker-practice', schemaVersion: 1, hands });
afterEach(async () => { vi.restoreAllMocks(); await deleteLocal(owner); await deleteLocal(other); });

it('pages in indexed timestamp/id order, merges page bookmarks, and isolates owners', async () => {
  const hands = Array.from({ length: 123 }, (_, i) => hand(i));
  await importHands(owner, bundle(hands)); await importHands(other, bundle([hand(500)]));
  await setBookmark(owner, hands[120]!.id, true);
  const expected = await listHands(owner);
  for (let page = 0; page < 3; page++) {
    const result = await getHandsPage(owner, page);
    expect(result).toEqual({ hands: expected.slice(page * 50, (page + 1) * 50), total: 123, page });
  }
  expect((await getHandsPage(owner, 99)).page).toBe(2);
  expect((await getHandsPage(owner, -1)).page).toBe(0);
  await deleteLocal(owner);
  expect(await getHandsPage(owner, 2)).toEqual({ hands: [], total: 0, page: 0 });
});

it('exports compact v1 JSON across batches with the same records, ordering and bookmarks', async () => {
  await importHands(owner, bundle(Array.from({ length: 205 }, (_, i) => hand(i))));
  await setBookmark(owner, hand(204).id, true);
  const progress: number[] = [];
  const blob = await exportHandsBlob(owner, completed => progress.push(completed));
  const text = await blob.text();
  expect(blob.type).toBe('application/json'); expect(text).not.toContain('\n');
  expect(progress).toEqual([0, 100, 200, 205]);
  const exported = JSON.parse(text);
  expect(exported).toEqual({ format: 'poker-practice', schemaVersion: 1, exportedAt: expect.any(String), hands: await listHands(owner) });
  expect(JSON.parse(await exportHands(owner)).hands).toEqual(exported.hands);
});

it('exports an empty archive and excludes additions after key capture', async () => {
  expect(JSON.parse(await (await exportHandsBlob(owner)).text()).hands).toEqual([]);
  await importHands(owner, bundle([hand(1)]));
  const real = db.hands.bulkGet.bind(db.hands);
  vi.spyOn(db.hands, 'bulkGet').mockImplementationOnce(keys => Dexie.Promise.resolve().then(async () => {
    await importHands(owner, bundle([hand(2)])); await setBookmark(owner, hand(1).id, true);
    return real(keys);
  }));
  const archive = JSON.parse(await (await exportHandsBlob(owner)).text());
  expect(archive.hands).toEqual([hand(1)]);
});

it('fails instead of exporting a missing, unreadable or invalid captured record', async () => {
  await importHands(owner, bundle([hand(1)]));
  const spy = vi.spyOn(db.hands, 'bulkGet').mockResolvedValueOnce([undefined]);
  await expect(exportHandsBlob(owner)).rejects.toThrow('no longer available');
  spy.mockRejectedValueOnce(new Error('read failed'));
  await expect(exportHandsBlob(owner)).rejects.toThrow('read failed');
  spy.mockRestore();
  await db.hands.put({ key: `${owner}:${hand(1).id}`, owner, record: { ...hand(1), initialHeroHole: [0, 0] } });
  await expect(exportHandsBlob(owner)).rejects.toThrow();
});
