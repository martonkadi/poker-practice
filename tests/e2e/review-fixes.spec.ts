import { test, expect, type Page } from './fixtures';
import type { HandRecord } from '../../packages/contracts/src/index';

async function preferences(page: Page) {
  return page.evaluate(() => new Promise<unknown[]>((resolve, reject) => {
    const open = indexedDB.open('poker-practice');
    open.onsuccess = () => { const db = open.result, tx = db.transaction('preferences'), request = tx.objectStore('preferences').getAll(); request.onsuccess = () => resolve(request.result); tx.oncomplete = () => db.close(); tx.onerror = () => reject(tx.error); };
    open.onerror = () => reject(open.error);
  }));
}

test('bb bets keep exact chip amounts, validation and unit switches', async ({ page }) => {
  await page.goto('/play'); await page.getByRole('button', { name: 'Deal the first hand' }).click();
  const input = page.getByRole('spinbutton', { name: 'Bet / raise to (chips)', exact: true });
  await expect(input).toHaveValue('200');
  await input.fill('201'); await page.getByLabel('Show bb').check();
  const bb = page.getByRole('spinbutton', { name: 'Bet / raise to (bb)', exact: true });
  await expect(bb).toHaveValue('2.01'); await expect(bb).toHaveAttribute('step', '0.01');
  await expect(page.getByRole('button', { name: /^Min/ })).toHaveText('Min · 2.0 bb');
  await expect(bb).toHaveAttribute('min', '2'); await expect(bb).toHaveAttribute('max', '100');
  await bb.fill('1.99'); await expect(page.getByRole('button', { name: 'Raise', exact: true })).toBeDisabled();
  await bb.fill('100.01'); await expect(page.getByRole('button', { name: 'Raise', exact: true })).toBeDisabled();
  await bb.fill('2.001'); await expect(page.getByRole('button', { name: 'Raise', exact: true })).toBeDisabled();
  await page.getByLabel('Show bb').uncheck(); await expect(input).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Raise', exact: true })).toBeDisabled();
  await page.getByLabel('Show bb').check(); await bb.fill('2.01');
  await page.getByRole('button', { name: 'Raise', exact: true }).click();
  await expect(page.locator('ol li').first()).toContainText('Bet / raise to 2.01 bb');
  const recorded = await page.evaluate(() => new Promise<{ action: { amount: number }; amount: number }>((resolve, reject) => {
    const open = indexedDB.open('poker-practice');
    open.onsuccess = () => { const db = open.result, tx = db.transaction('active'), request = tx.objectStore('active').get('guest'); request.onsuccess = () => resolve(request.result.decisions[0]); tx.oncomplete = () => db.close(); tx.onerror = () => reject(tx.error); };
  }));
  expect(recorded.action.amount).toBe(201); expect(recorded.amount).toBe(151);
});

test('rapid preference choices finish before deletion and notify another tab', async ({ page, browserName }) => {
  test.slow();
  const second = await page.context().newPage();
  for (let repeat = 0; repeat < (browserName === 'chromium' ? 10 : 1); repeat++) {
    await page.goto('/play'); await expect(page.getByRole('button', { name: 'Deal the first hand' })).toBeEnabled();
    await page.getByLabel('Show bb').check(); await expect.poll(() => preferences(page).then(rows => rows.length)).toBe(1);
    await second.goto('/history'); await expect(second.getByText('No completed hands yet.')).toBeVisible();
    await second.evaluate(async () => {
      const state = window as typeof window & { releasePreference?: () => void };
      await new Promise<void>(started => { void navigator.locks.request('poker-preference-guest', async () => { started(); await new Promise<void>(resolve => { state.releasePreference = resolve; }); }); });
    });
    await page.evaluate(() => { const box = document.querySelector('input[type=checkbox]') as HTMLInputElement; for (let i = 0; i < 201; i++) box.click(); });
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Delete local data' }).click();
    await expect(page.getByRole('button', { name: 'Delete local data' })).toBeDisabled();
    await second.evaluate(() => (window as typeof window & { releasePreference?: () => void }).releasePreference?.());
    await expect(page).toHaveURL('/'); expect(await preferences(page)).toEqual([]);
    // Keep the mounted provider: a stale bb choice here would reveal a missed notification.
    await second.getByRole('link', { name: 'Play', exact: true }).click();
    await expect(second.getByLabel('Show bb')).not.toBeChecked();
    await second.getByRole('link', { name: 'History', exact: true }).click();
  }
  await second.close();
});

test('history reads pages in timestamp/id order and refreshes after another tab deletes', async ({ page }) => {
  await page.goto('/history'); await expect(page.getByText('No completed hands yet.')).toBeVisible();
  const at = '2025-01-01T00:00:00.000Z';
  const hands: HandRecord[] = Array.from({ length: 110 }, (_, i) => ({ schemaVersion: 1, engineVersion: 'fixture', botVersion: 'standard-v1', id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    sessionId: '00000000-0000-4000-8000-000000000000', sessionStartedAt: at, sequence: i, completedAt: at, button: 'hero', difficulty: 'standard', initialHeroHole: [0, 1], botHole: null,
    finalBoard: [], decisions: [], heroNet: i, reachedShowdown: false, heroWonShowdown: false, bookmarked: false }));
  await page.evaluate(records => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('poker-practice'); open.onsuccess = () => {
      const db = open.result, tx = db.transaction('hands', 'readwrite');
      for (const record of records) tx.objectStore('hands').put({ key: `guest:${record.id}`, owner: 'guest', record });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  }), hands);
  await page.reload(); await expect(page.locator('article')).toHaveCount(50);
  await expect(page.locator('article a').first()).toHaveAttribute('href', `/review/${hands[109]!.id}`);
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await expect(page.getByText('Page 2 of 3')).toBeVisible();
  await expect(page.locator('article a').first()).toHaveAttribute('href', `/review/${hands[59]!.id}`);
  await page.getByRole('button', { name: 'Next', exact: true }).click(); await expect(page.locator('article')).toHaveCount(10);
  const second = await page.context().newPage(); await second.goto('/settings');
  second.once('dialog', dialog => dialog.accept()); await second.getByRole('button', { name: 'Delete local data' }).click();
  await expect(second).toHaveURL('/'); await expect(page.getByText('No completed hands yet.')).toBeVisible();
  await second.close();
});

test('export cancellation and navigation terminate workers without downloading', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    const state = window as typeof window & { exportTerminations: number }; state.exportTerminations = 0;
    window.Worker = class extends Original {
      postMessage() { /* Keep export pending to exercise cancellation. */ }
      terminate() { state.exportTerminations++; super.terminate(); }
    };
  });
  let downloads = 0; page.on('download', () => downloads++);
  await page.goto('/settings'); await page.getByRole('button', { name: 'Export JSON' }).click();
  await expect(page.getByRole('button', { name: 'Delete local data' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel export' }).click(); await expect(page.getByText('Export cancelled.')).toBeVisible();
  await page.getByRole('button', { name: 'Export JSON' }).click(); await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { exportTerminations: number }).exportTerminations)).toBe(2);
  expect(downloads).toBe(0);
});
