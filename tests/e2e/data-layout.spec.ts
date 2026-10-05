// Release browser scenarios for local data and narrow layout (Req 6.1–6.4, 10.4):
// export (download, parse, validate), deletion (confirm, IndexedDB empty, home page)
// and every route at a 390 px viewport without horizontal page overflow.
import type { Locator } from '@playwright/test';
import { test, expect, type Page } from './fixtures';
import { handRecordSchema } from '../../packages/contracts/src/index';

const STORES = ['active', 'hands', 'bookmarks', 'preferences', 'outbox'] as const;
type StoreName = typeof STORES[number];

/** Reads every row of the given object stores from the app's real IndexedDB database. */
async function readStores(page: Page): Promise<Record<StoreName, unknown[]>> {
  return await page.evaluate(async names => {
    return await new Promise<Record<string, unknown[]>>((resolve, reject) => {
      const request = indexedDB.open('poker-practice');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const present = names.filter(n => db.objectStoreNames.contains(n));
        const out: Record<string, unknown[]> = Object.fromEntries(names.map(n => [n, []]));
        if (!present.length) { db.close(); resolve(out); return; }
        const tx = db.transaction(present, 'readonly');
        for (const name of present) {
          const all = tx.objectStore(name).getAll();
          all.onsuccess = () => { out[name] = all.result; };
        }
        tx.oncomplete = () => { db.close(); resolve(out); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }, [...STORES]) as Record<StoreName, unknown[]>;
}

/** Puts one row into a store of the app's real IndexedDB database (test tooling only). */
async function putRow(page: Page, store: StoreName, value: unknown): Promise<void> {
  await page.evaluate(async ({ store, value }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('poker-practice');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }, { store, value });
}

/**
 * Finishes the hand that is currently dealt by folding at the hero's first decision.
 * When the bot holds the button it acts first and may fold itself, ending the hand
 * before the hero acts, so either outcome is accepted.
 */
async function foldCurrentHand(page: Page): Promise<string> {
  const complete = page.getByRole('heading', { name: 'Hand complete', exact: true });
  const fold = page.locator('button:enabled', { hasText: /^Fold/ });
  await expect(complete.or(fold).first()).toBeVisible();
  if (!await complete.isVisible()) await fold.click();
  await expect(complete).toBeVisible();
  const href = await page.getByRole('link', { name: 'Review hand' }).getAttribute('href');
  expect(href).toMatch(/^\/review\/[0-9a-f-]{36}$/);
  return href!;
}

/** Plays `count` hands from an empty store, folding each one, and returns their review paths. */
async function playFoldedHands(page: Page, count: number): Promise<string[]> {
  await page.goto('/play');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  const reviews = [await foldCurrentHand(page)];
  while (reviews.length < count) {
    const previous = reviews[reviews.length - 1]!;
    await page.getByRole('button', { name: 'Next hand' }).click();
    // The previous hand's result stays visible until the new deal is saved.
    await expect(page.locator(`a[href="${previous}"]`)).toHaveCount(0);
    reviews.push(await foldCurrentHand(page));
  }
  return reviews;
}

async function downloadExport(page: Page): Promise<{ name: string; archive: { format: unknown; schemaVersion: unknown; exportedAt: unknown; hands: unknown[] } }> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return { name: download.suggestedFilename(), archive: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
}

test('export with no saved hands downloads an empty valid archive', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const { name, archive } = await downloadExport(page);
  expect(name).toMatch(/^headsup-\d{4}-\d{2}-\d{2}\.json$/);
  expect(archive.format).toBe('poker-practice');
  expect(archive.schemaVersion).toBe(1);
  expect(archive.hands).toEqual([]);
  await expect(page.getByText('Export failed', { exact: false })).toHaveCount(0);
});

test('export downloads every saved hand as a valid schema v1 archive', async ({ page }) => {
  test.slow();
  await playFoldedHands(page, 2);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const saved = (await readStores(page)).hands as Array<{ owner: string; record: { id: string } }>;
  expect(saved).toHaveLength(2);

  const { archive } = await downloadExport(page);
  expect(archive.format).toBe('poker-practice');
  expect(archive.schemaVersion).toBe(1);
  expect(Number.isNaN(Date.parse(String(archive.exportedAt)))).toBe(false);
  expect(archive.hands).toHaveLength(saved.length);
  const parsed = archive.hands.map(h => handRecordSchema.parse(h));
  // Field-for-field equality with the stored records (no bookmarks exist, so none are merged in).
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  expect([...parsed].sort(byId)).toEqual(saved.filter(r => r.owner === 'guest').map(r => r.record).sort(byId));
});

test('deletion asks first, then clears every local table and returns home', async ({ page }) => {
  const [review] = await playFoldedHands(page, 1);
  const handId = review!.split('/').pop()!;
  // Store a chip-unit preference through the UI and a bookmark row directly (there is no bookmark UI).
  await page.getByLabel('Show bb').check();
  await expect.poll(async () => (await readStores(page)).preferences.length).toBe(1);
  await putRow(page, 'bookmarks', { key: `guest:${handId}`, owner: 'guest', handId, bookmarked: true, dirty: false });
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const before = await readStores(page);
  expect(before.hands).toHaveLength(1);
  expect(before.active).toHaveLength(1);
  expect(before.bookmarks).toHaveLength(1);
  expect(before.preferences).toHaveLength(1);

  // Cancelling the confirmation keeps all data and stays on Settings (Req 6.3, 6.5).
  const dismissed: string[] = [];
  page.once('dialog', dialog => { dismissed.push(`${dialog.type()}: ${dialog.message()}`); void dialog.dismiss(); });
  await page.getByRole('button', { name: 'Delete local data' }).click();
  await expect.poll(() => dismissed.length).toBe(1);
  expect(dismissed[0]).toMatch(/^confirm: Delete all guest poker data saved in this browser\?/);
  await expect(page).toHaveURL('/settings');
  expect(await readStores(page)).toEqual(before);

  // Confirming deletes hands, bookmarks, the active session and the preference, then goes home (Req 6.4).
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: 'Delete local data' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Play the hand. Study the decision.' })).toBeVisible();
  const after = await readStores(page);
  for (const name of STORES) expect(after[name], `${name} should be empty`).toEqual([]);
  await page.goto('/history');
  await expect(page.getByText('No completed hands yet.')).toBeVisible();
});

test('every route fits a 390 px viewport without horizontal page overflow', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  const measure = () => page.evaluate(() => document.documentElement.scrollWidth);
  // The table mid-hand (action controls, raise row and presets). In the first hand the
  // hero holds the button and acts first, so the decision controls are always shown.
  await page.goto('/play');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(page.getByRole('heading', { name: 'Your decision', exact: true })).toBeVisible();
  await expect(page.locator('button:enabled', { hasText: /^Fold/ })).toBeVisible();
  expect(await measure(), '/play mid-hand scrollWidth').toBeLessThanOrEqual(390);
  // Fold so History and Review have a saved hand to show.
  const review = await foldCurrentHand(page);
  const routes: Array<{ path: string; ready: (p: Page) => Locator }> = [
    { path: '/', ready: p => p.getByRole('heading', { name: 'Play the hand. Study the decision.' }) },
    { path: '/play', ready: p => p.getByRole('heading', { name: 'Hand complete', exact: true }) },
    { path: '/history', ready: p => p.locator('article').first() },
    { path: review, ready: p => p.getByRole('heading', { name: 'Decision 1 of 1' }) },
    { path: '/review/does-not-exist', ready: p => p.getByRole('heading', { name: 'Hand unavailable' }) },
    { path: '/settings', ready: p => p.getByRole('heading', { name: 'Settings', exact: true }) },
    { path: '/about', ready: p => p.getByRole('heading', { name: 'Practice with clear limits' }) },
    { path: '/no-such-page', ready: p => p.getByRole('heading', { name: 'Page not found' }) }
  ];
  for (const route of routes) {
    await page.goto(route.path);
    await expect(route.ready(page)).toBeVisible();
    expect(await measure(), `${route.path} scrollWidth`).toBeLessThanOrEqual(390);
  }
});
