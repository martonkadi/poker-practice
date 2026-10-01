import Dexie, { type EntityTable, type Transaction } from 'dexie';
import { handRecordSchema } from '@poker/contracts';
import type { DecisionRecord, Difficulty, HandRecord } from '@poker/contracts';
import type { EngineState } from '@poker/poker';

export interface ActiveSession {
  id: string;
  owner: string;
  state: EngineState;
  difficulty: Difficulty;
  nextSequence: number;
  decisions: DecisionRecord[];
  recordedHandId?: string;
  startedAt: string;
}
interface StoredHand { key: string; owner: string; record: HandRecord }
interface OutboxItem { key: string; owner: string; handId: string; sessionId: string; sequence: number }
interface Bookmark { key: string; owner: string; handId: string; bookmarked: boolean; dirty: boolean }
interface Preference { owner: string; chipsAsBb: boolean; animationSpeed: 'normal' | 'fast' | 'none' }
/** Dexie schema of version 1 (bookmarks lived on `record.bookmarked`). Exported for the migration test. */
export const SCHEMA_V1 = { active: 'owner', hands: 'key,owner,[owner+record.completedAt]', outbox: 'key,owner', preferences: 'owner' } as const;
/** Dexie schema of version 2 (bookmarks moved to their own table). */
export const SCHEMA_V2 = { ...SCHEMA_V1, bookmarks: 'key,owner' } as const;
/** v1 → v2 upgrade: moves each `record.bookmarked = true` into the bookmarks table. */
export async function upgradeV1ToV2(tx: Transaction): Promise<void> {
  const rows = await tx.table<StoredHand, string>('hands').toArray();
  for (const row of rows) {
    if (!row.record.bookmarked) continue;
    await tx.table<Bookmark, string>('bookmarks').put({ key: row.key, owner: row.owner, handId: row.record.id, bookmarked: true, dirty: row.owner !== GUEST_OWNER });
    await tx.table<StoredHand, string>('hands').put({ ...row, record: { ...row.record, bookmarked: false } });
  }
}
export class PracticeDatabase extends Dexie {
  active!: EntityTable<ActiveSession, 'owner'>;
  hands!: EntityTable<StoredHand, 'key'>;
  outbox!: EntityTable<OutboxItem, 'key'>;
  bookmarks!: EntityTable<Bookmark, 'key'>;
  preferences!: EntityTable<Preference, 'owner'>;
  constructor(name = 'poker-practice') {
    super(name);
    this.version(1).stores(SCHEMA_V1);
    this.version(2).stores(SCHEMA_V2).upgrade(upgradeV1ToV2);
  }
}
export const db = new PracticeDatabase();
export const GUEST_OWNER = 'guest';
export type StoreStatus = { ok: true } | { ok: false; reason: string };
/**
 * Opens the store once at boot. Dexie runs schema upgrades inside a
 * version-change transaction, so a failed open or upgrade aborts without
 * partial writes and the stored data stays as it was.
 */
export async function openStore(database: Dexie = db): Promise<StoreStatus> {
  try {
    await database.open();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}
export async function loadActive(owner: string): Promise<ActiveSession | undefined> { return db.active.get(owner); }
export async function saveActive(session: ActiveSession): Promise<void> { await db.active.put(session); }
export async function abandonActive(owner: string): Promise<void> { await db.active.delete(owner); }
export async function saveCompleted(owner: string, record: HandRecord, active: ActiveSession): Promise<void> {
  handRecordSchema.parse(record);
  const key = `${owner}:${record.id}`;
  await db.transaction('rw', db.hands, db.outbox, db.active, db.bookmarks, async () => {
    await db.hands.put({ key, owner, record: { ...record, bookmarked: false } });
    if (record.bookmarked) await db.bookmarks.put({ key, owner, handId: record.id, bookmarked: true, dirty: owner !== GUEST_OWNER });
    if (owner !== GUEST_OWNER) await db.outbox.put({ key, owner, handId: record.id, sessionId: record.sessionId, sequence: record.sequence });
    await db.active.put(active);
  });
}
export async function listHands(owner: string): Promise<HandRecord[]> {
  const [rows, marks] = await Promise.all([db.hands.where('owner').equals(owner).toArray(), db.bookmarks.where('owner').equals(owner).toArray()]);
  const marked = new Map(marks.map(x => [x.handId, x.bookmarked]));
  return rows.map(x => ({ ...x.record, bookmarked: marked.get(x.record.id) ?? false })).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}
export async function getHand(owner: string, id: string): Promise<HandRecord | undefined> {
  const key = `${owner}:${id}`;
  const [row, mark] = await Promise.all([db.hands.get(key), db.bookmarks.get(key)]);
  return row ? { ...row.record, bookmarked: mark?.bookmarked ?? false } : undefined;
}
export async function setBookmark(owner: string, id: string, bookmarked: boolean): Promise<void> {
  const key = `${owner}:${id}`;
  if (!await db.hands.get(key)) return;
  await db.bookmarks.put({ key, owner, handId: id, bookmarked, dirty: owner !== GUEST_OWNER });
}
export async function pendingBookmarks(owner: string): Promise<Bookmark[]> {
  return (await db.bookmarks.where('owner').equals(owner).toArray()).filter(x => x.dirty);
}
export async function acknowledgeBookmark(owner: string, id: string, bookmarked: boolean): Promise<void> {
  const key = `${owner}:${id}`;
  const current = await db.bookmarks.get(key);
  if (current?.bookmarked === bookmarked) await db.bookmarks.put({ ...current, dirty: false });
}
export async function reconcileCloudBookmarks(owner: string, cloudIds: string[]): Promise<void> {
  const cloudSet = new Set(cloudIds);
  await db.transaction('rw', db.bookmarks, db.hands, async () => {
    const [marks, hands] = await Promise.all([db.bookmarks.where('owner').equals(owner).toArray(), db.hands.where('owner').equals(owner).toArray()]);
    const known = new Map(marks.map(x => [x.handId, x]));
    for (const hand of hands) {
      const id = hand.record.id;
      if (known.get(id)?.dirty) continue;
      await db.bookmarks.put({ key: hand.key, owner, handId: id, bookmarked: cloudSet.has(id), dirty: false });
    }
  });
}
export async function getPreference(owner: string): Promise<Preference> { return await db.preferences.get(owner) ?? { owner, chipsAsBb: false, animationSpeed: 'normal' }; }
export async function putPreference(pref: Preference): Promise<void> { await db.preferences.put(pref); }
export async function exportHands(owner: string): Promise<string> {
  return JSON.stringify({ format: 'poker-practice', schemaVersion: 1, exportedAt: new Date().toISOString(), hands: await listHands(owner) }, null, 2);
}
export async function importHands(owner: string, source: string): Promise<{ imported: number; duplicates: number }> {
  if (source.length > 20_000_000) throw new Error('Import exceeds 20 MB');
  const raw: unknown = JSON.parse(source);
  if (!raw || typeof raw !== 'object' || !('format' in raw) || raw.format !== 'poker-practice' || !('schemaVersion' in raw) || raw.schemaVersion !== 1 || !('hands' in raw) || !Array.isArray(raw.hands) || raw.hands.length > 20_000) throw new Error('Invalid export format');
  const records = raw.hands.map((x: unknown) => handRecordSchema.parse(x));
  let imported = 0, duplicates = 0;
  await db.transaction('rw', db.hands, db.outbox, db.bookmarks, async () => {
    for (const record of records) {
      const key = `${owner}:${record.id}`;
      if (await db.hands.get(key)) duplicates++;
      else {
        await db.hands.add({ key, owner, record: { ...record, bookmarked: false } });
        if (record.bookmarked) await db.bookmarks.put({ key, owner, handId: record.id, bookmarked: true, dirty: owner !== GUEST_OWNER });
        if (owner !== GUEST_OWNER) await db.outbox.put({ key, owner, handId: record.id, sessionId: record.sessionId, sequence: record.sequence });
        imported++;
      }
    }
  });
  return { imported, duplicates };
}
export async function pendingSync(owner: string): Promise<HandRecord[]> {
  const entries = await db.outbox.where('owner').equals(owner).toArray();
  const records = await Promise.all(entries.map(x => db.hands.get(x.key)));
  return records.flatMap(x => x ? [x.record] : []).sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.sequence - b.sequence);
}
export async function acknowledgeSync(owner: string, sessionId: string, throughSequence: number): Promise<void> {
  const entries = await db.outbox.where('owner').equals(owner).toArray();
  await db.outbox.bulkDelete(entries.filter(x => x.sessionId === sessionId && x.sequence <= throughSequence).map(x => x.key));
}
export async function cacheCloudHands(owner: string, records: HandRecord[]): Promise<void> {
  const parsed = records.map(x => handRecordSchema.parse(x));
  await db.transaction('rw', db.hands, db.bookmarks, async () => {
    for (const record of parsed) {
      const key = `${owner}:${record.id}`;
      if (!(await db.hands.get(key))) {
        await db.hands.add({ key, owner, record: { ...record, bookmarked: false } });
        if (record.bookmarked) await db.bookmarks.put({ key, owner, handId: record.id, bookmarked: true, dirty: false });
      }
    }
  });
}
export async function deleteLocal(owner: string): Promise<void> {
  await db.transaction('rw', db.active, db.hands, db.outbox, db.bookmarks, db.preferences, async () => {
    await db.active.delete(owner);
    await db.hands.where('owner').equals(owner).delete();
    await db.outbox.where('owner').equals(owner).delete();
    await db.bookmarks.where('owner').equals(owner).delete();
    await db.preferences.delete(owner);
  });
}
