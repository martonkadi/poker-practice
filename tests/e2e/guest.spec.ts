import { test, expect, type Page } from '@playwright/test';
import { createHand, hole } from '../../packages/poker/src/index';
import { textToCard } from '../../packages/contracts/src/index';
import type { ActiveSession } from '../../packages/persistence/src/index';

async function strongBotFixture(page: Page): Promise<void> {
  const first = ['As', 'Ah', 'Kc', 'Kd', '4s', '2c', '3d', '7s', '5d', '9h', '6c', 'Qc'].map(textToCard);
  const deck = [...first, ...Array.from({ length: 52 }, (_, i) => i).filter(c => !first.includes(c))];
  let state = await createHand('hero', undefined, deck);
  if (hole(state, 'bot')[0] !== textToCard('As')) {
    [deck[0], deck[1], deck[2], deck[3]] = [deck[2]!, deck[3]!, deck[0]!, deck[1]!];
    state = await createHand('hero', undefined, deck);
  }
  expect(hole(state, 'bot')).toEqual([textToCard('As'), textToCard('Ah')]);
  const active: ActiveSession = { id: crypto.randomUUID(), owner: 'guest', state, difficulty: 'standard', nextSequence: 0, decisions: [], startedAt: new Date().toISOString() };
  await page.goto('/history');
  await expect(page.getByText('No completed hands yet.')).toBeVisible();
  // Seed the real private recovery store. No app runtime test endpoint or altered policy.
  await page.evaluate(async value => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('poker-practice');
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('active', 'readwrite');
        tx.objectStore('active').put(value);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      request.onerror = () => reject(request.error);
    });
  }, active);
  await page.goto('/play');
  await expect(page.getByRole('heading', { name: 'Your decision', exact: true })).toBeVisible();
}
async function finishPassively(page: Page): Promise<void> {
  let reloaded = false;
  for (let i = 0; i < 50; i++) {
    await expect(page.getByRole('heading', { name: /^(Your decision|Hand complete)$/ })).toBeVisible();
    if (await page.getByRole('heading', { name: 'Hand complete', exact: true }).isVisible()) return;
    if (!reloaded && await page.getByText('FLOP', { exact: true }).isVisible()) {
      const actions = await page.locator('ol li').count();
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Your decision', exact: true })).toBeVisible();
      await expect(page.locator('ol li')).toHaveCount(actions);
      reloaded = true;
    }
    await page.getByRole('button', { name: /^(Call|Check)/ }).click();
  }
  throw new Error('Hand did not finish');
}

test('guest finishes, reloads and reviews a hand without cloud requests', async ({ page }) => {
  const cloudRequests: string[] = [];
  page.on('request', request => { if (/supabase|google.*oauth/.test(request.url())) cloudRequests.push(request.url()); });
  await page.goto('/');
  await page.getByRole('link', { name: 'Start playing' }).click();
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(page.getByRole('heading', { name: 'Your decision', exact: true })).toBeVisible();
  if (process.env.CAPTURE_SCREENSHOTS === '1') {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: 'docs/screenshots/table-desktop.png', fullPage: true });
  }
  await page.reload();
  await page.getByRole('button', { name: /Fold/ }).click();
  await page.getByRole('link', { name: 'Review hand' }).click();
  await expect(page.getByRole('heading', { name: 'Decision 1 of 1' })).toBeVisible();
  await expect(page.getByText('25.0%', { exact: true })).toBeVisible();
  if (process.env.CAPTURE_SCREENSHOTS === '1') await page.screenshot({ path: 'docs/screenshots/review-desktop.png', fullPage: true });
  await page.reload();
  await expect(page.getByText('25.0%', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(1);
  expect(cloudRequests).toEqual([]);
});

test('real worker completes betting through showdown and three successive hands', async ({ page }) => {
  await strongBotFixture(page);
  await page.getByRole('spinbutton', { name: 'Bet / raise to' }).fill('300');
  await page.getByRole('button', { name: 'Raise', exact: true }).click();
  await finishPassively(page);
  await expect(page.getByText('Showdown · Bot wins', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Review hand' }).click();
  await expect(page.getByText('Bet / raise to 300', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bot action · preflop' })).toBeVisible();
  await page.getByRole('link', { name: 'Play', exact: true }).click();
  for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: 'Next hand' }).click(); await finishPassively(page); }
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.locator('article')).toHaveCount(3);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const records = JSON.parse(Buffer.concat(chunks).toString()).hands.sort((a: { sequence: number }, b: { sequence: number }) => a.sequence - b.sequence);
  expect(records.map((h: { sequence: number }) => h.sequence)).toEqual([0, 1, 2]);
  expect(records.map((h: { button: string }) => h.button)).toEqual(['hero', 'bot', 'hero']);
  expect(new Set(records.map((h: { sessionStartedAt: string }) => h.sessionStartedAt)).size).toBe(1);
});

test('narrow table has no horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/play');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  if (process.env.CAPTURE_SCREENSHOTS === '1') await page.screenshot({ path: 'docs/screenshots/table-mobile.png', fullPage: true });
});

test('keyboard play ignores typing and repeat events', async ({ page }) => {
  await page.goto('/play');
  await expect(page.getByRole('button', { name: 'Deal the first hand' })).toBeEnabled();
  for (let i = 0; i < 12; i++) {
    if (await page.getByRole('button', { name: 'Deal the first hand' }).evaluate(el => el === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(page.getByRole('button', { name: 'Deal the first hand' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('spinbutton', { name: 'Bet / raise to' }).focus();
  await page.keyboard.press('f');
  await expect(page.getByRole('heading', { name: 'Your decision', exact: true })).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Bet / raise to' }).press('Tab');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', repeat: true })));
  await expect(page.getByRole('heading', { name: 'Your decision', exact: true })).toBeVisible();
  await page.keyboard.press('f');
  await expect(page.getByRole('heading', { name: 'Hand complete' })).toBeVisible();
});

test('waiting tab reloads the advanced hand and rapid input commits once', async ({ page }) => {
  await strongBotFixture(page);
  const second = await page.context().newPage();
  await second.goto('/play');
  await expect(second.getByText('This session is open in another tab', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /Fold/ }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(page.getByRole('heading', { name: 'Hand complete' })).toBeVisible();
  await page.close();
  await expect(second.getByRole('button', { name: 'Next hand' })).toBeEnabled();
  await expect(second.locator('ol li')).toHaveCount(1);
  await second.getByRole('link', { name: 'History', exact: true }).click();
  await expect(second.locator('article')).toHaveCount(1);
  await second.close();
});

for (const failure of ['crash', 'timeout'] as const) {
  test(`bot ${failure} can be retried with a fresh worker`, async ({ page }) => {
    await page.addInitScript(mode => {
      const Original = window.Worker;
      let failed = false;
      window.Worker = class extends Original {
        postMessage(message: unknown): void {
          if (!failed) { failed = true; if (mode === 'crash') setTimeout(() => this.dispatchEvent(new Event('error')), 0); return; }
          super.postMessage(message);
        }
      };
    }, failure);
    await strongBotFixture(page);
    await page.getByRole('button', { name: /^Call/ }).click();
    await expect(page.getByRole('button', { name: 'Retry bot' })).toBeVisible({ timeout: 12_000 });
    await page.getByRole('button', { name: 'Retry bot' }).click();
    await expect(page.getByRole('heading', { name: 'Your decision', exact: true })).toBeVisible({ timeout: 12_000 });
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('navigation cancels a pending worker and reload resumes the saved decision', async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    const counts = window as typeof window & { terminatedWorkers: number };
    counts.terminatedWorkers = 0;
    window.Worker = class extends Original {
      postMessage(): void { /* Deliberately hung worker, confined to this test. */ }
      terminate(): void { counts.terminatedWorkers++; super.terminate(); }
    };
  });
  await strongBotFixture(page);
  await page.getByRole('button', { name: /^Call/ }).click();
  await expect(page.getByRole('heading', { name: 'Bot is thinking…' })).toBeVisible();
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { terminatedWorkers: number }).terminatedWorkers)).toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Play', exact: true }).click();
  await expect(page.locator('ol li')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Bot is thinking…' })).toBeVisible();
});

test('missing review resolves and local deletion clears completed history', async ({ page }) => {
  await page.goto('/review/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Hand unavailable' })).toBeVisible();
  await page.goto('/play');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await page.getByRole('button', { name: /Fold/ }).click();
  await expect(page.getByRole('heading', { name: 'Hand complete' })).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete local data' }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/history');
  await expect(page.getByText('No completed hands yet.')).toBeVisible();
});

test('a failed save leaves the hand uncommitted and can be retried', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    let failed = false;
    IDBObjectStore.prototype.put = function(value: unknown, key?: IDBValidKey) {
      if (this.name === 'active' && !failed) { failed = true; throw new DOMException('Storage is full', 'QuotaExceededError'); }
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    };
  });
  await page.goto('/play');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deal the first hand' })).toBeEnabled();
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(page.getByRole('heading', { name: 'Your decision', exact: true })).toBeVisible();
});

test('deletion does not race an active table in another tab', async ({ page }) => {
  await page.goto('/play');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  const second = await page.context().newPage();
  await second.goto('/settings');
  second.once('dialog', dialog => dialog.accept());
  await second.getByRole('button', { name: 'Delete local data' }).click();
  await expect(second.getByText('Close the practice table in other tabs before deleting data.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your decision', exact: true })).toBeVisible();
  await second.close();
});
