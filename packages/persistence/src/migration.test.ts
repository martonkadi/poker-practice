import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { handRecordSchema, type HandRecord } from '@poker/contracts';
import { applyAction, createHand, frame, hole, result } from '@poker/poker';
import { GUEST_OWNER, PracticeDatabase, SCHEMA_V1, SCHEMA_V2, db, getHand, listHands, loadActive, openStore, upgradeV1ToV2, type ActiveSession } from './index';

const DB_NAME = 'poker-practice';
const OWNER = GUEST_OWNER;
const DECK = Array.from({ length: 52 }, (_, i) => i);

/** A real one-decision hand (hero on the button folds preflop), validated against handRecordSchema v1. */
async function fixtureHand(offsetMs: number, bookmarked: boolean): Promise<HandRecord> {
  const start = await createHand('hero', undefined, DECK);
  const before = frame(start);
  const end = await applyAction(start, 'hero', { kind: 'fold' });
  const outcome = result(end);
  const startedAt = new Date(Date.UTC(2024, 0, 1)).toISOString();
  return handRecordSchema.parse({
    schemaVersion: 1, engineVersion: 'fixture', botVersion: 'standard-v1', id: crypto.randomUUID(), sessionId: crypto.randomUUID(),
    sessionStartedAt: startedAt, sequence: 0, completedAt: new Date(Date.UTC(2024, 0, 1) + offsetMs).toISOString(),
    button: 'hero', difficulty: 'standard', initialHeroHole: hole(start, 'hero'), botHole: null, finalBoard: [],
    decisions: [{ frame: before, action: { kind: 'fold' }, amount: 0, heroHole: hole(start, 'hero') }],
    heroNet: outcome.heroNet, reachedShowdown: outcome.showdown, heroWonShowdown: outcome.heroWonShowdown, bookmarked
  });
}
async function fixtureActive(): Promise<ActiveSession> {
  const state = await createHand('bot', undefined, DECK);
  return { id: crypto.randomUUID(), owner: OWNER, state, difficulty: 'easy', nextSequence: 2, decisions: [], startedAt: new Date(Date.UTC(2024, 0, 2)).toISOString() };
}
const key = (record: HandRecord) => `${OWNER}:${record.id}`;

interface Snapshot { hands: unknown[]; bookmarks: unknown[]; active: unknown[]; outbox: unknown[]; preferences: unknown[] }
async function rawSnapshot(version: 1 | 2): Promise<Snapshot> {
  const raw = new Dexie(DB_NAME);
  raw.version(version).stores(version === 1 ? SCHEMA_V1 : SCHEMA_V2);
  try {
    return {
      hands: await raw.table('hands').toArray(), active: await raw.table('active').toArray(), outbox: await raw.table('outbox').toArray(),
      preferences: await raw.table('preferences').toArray(), bookmarks: version === 2 ? await raw.table('bookmarks').toArray() : []
    };
  } finally { raw.close(); }
}

afterEach(async () => {
  db.close({ disableAutoOpen: false });
  await Dexie.delete(DB_NAME);
});

describe('Dexie v1/v2 migration', () => {
  it('reads every hand, bookmark and the active session from a v1 database unchanged', async () => {
    const marked = await fixtureHand(1_000, true), plain = await fixtureHand(2_000, false), active = await fixtureActive();
    const raw = new Dexie(DB_NAME);
    raw.version(1).stores(SCHEMA_V1);
    await raw.table('hands').bulkPut([{ key: key(marked), owner: OWNER, record: marked }, { key: key(plain), owner: OWNER, record: plain }]);
    await raw.table('active').put(active);
    raw.close();

    expect(await openStore()).toEqual({ ok: true });
    expect(db.verno).toBe(2);
    expect(await db.hands.count()).toBe(2);
    expect(await db.active.count()).toBe(1);
    expect(await db.bookmarks.toArray()).toEqual([{ key: key(marked), owner: OWNER, handId: marked.id, bookmarked: true, dirty: false }]);
    expect(await listHands(OWNER)).toEqual([plain, marked]);
    expect(await getHand(OWNER, marked.id)).toEqual(marked);
    expect(await getHand(OWNER, plain.id)).toEqual(plain);
    expect(await loadActive(OWNER)).toEqual(active);
  });

  it('reads every hand, bookmark and the active session from a v2 database unchanged', async () => {
    const marked = await fixtureHand(1_000, true), plain = await fixtureHand(2_000, false), active = await fixtureActive();
    const bookmark = { key: key(marked), owner: OWNER, handId: marked.id, bookmarked: true, dirty: false };
    const raw = new Dexie(DB_NAME);
    raw.version(2).stores(SCHEMA_V2);
    await raw.table('hands').bulkPut([{ key: key(marked), owner: OWNER, record: { ...marked, bookmarked: false } }, { key: key(plain), owner: OWNER, record: plain }]);
    await raw.table('bookmarks').put(bookmark);
    await raw.table('active').put(active);
    raw.close();
    const before = await rawSnapshot(2);

    expect(await openStore()).toEqual({ ok: true });
    expect(await db.hands.count()).toBe(2);
    expect(await db.active.count()).toBe(1);
    expect(await db.bookmarks.toArray()).toEqual([bookmark]);
    expect(await listHands(OWNER)).toEqual([plain, marked]);
    expect(await loadActive(OWNER)).toEqual(active);
    db.close({ disableAutoOpen: false });
    expect(await rawSnapshot(2)).toEqual(before);
  });

  it('leaves v1 data unmodified and reports ok: false when the v2 upgrade fails', async () => {
    const marked = await fixtureHand(1_000, true), active = await fixtureActive();
    const raw = new Dexie(DB_NAME);
    raw.version(1).stores(SCHEMA_V1);
    await raw.table('hands').put({ key: key(marked), owner: OWNER, record: marked });
    await raw.table('active').put(active);
    raw.close();
    const before = await rawSnapshot(1);

    class FailingUpgrade extends PracticeDatabase {
      constructor() {
        super(DB_NAME);
        // Same real v2 upgrade path, which then aborts after writing.
        this.version(2).stores(SCHEMA_V2).upgrade(async tx => { await upgradeV1ToV2(tx); throw new Error('forced upgrade failure'); });
      }
    }
    const broken = new FailingUpgrade();
    const status = await openStore(broken);
    expect(status.ok).toBe(false);
    if (!status.ok) expect(status.reason).toContain('forced upgrade failure');
    broken.close();

    const after = await rawSnapshot(1);
    expect(after).toEqual(before);
    expect(after.hands).toEqual([{ key: key(marked), owner: OWNER, record: marked }]);
    expect(after.active).toEqual([active]);
    const check = new Dexie(DB_NAME);
    try { expect((await check.open()).verno).toBe(1); } finally { check.close(); }
  });
});
