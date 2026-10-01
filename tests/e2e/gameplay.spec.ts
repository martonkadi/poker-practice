// Release browser suite: gameplay scenarios (Req 2.7, 10.4).
//
// Covers a showdown hand, a fold hand, three hands with an alternating dealer button,
// a mid-hand reload that restores the same state, rapid repeated input that commits one
// Decision_Record, and a hand played with the keyboard only.
//
// Fixtures go through test tooling only: the active session is seeded into the app's own
// IndexedDB store from the page, and Worker overrides use `page.addInitScript`. Nothing
// here relies on a production test hook.
import { test, expect, type Page } from './fixtures';
import { createHand, hole } from '../../packages/poker/src/index';
import { textToCard } from '../../packages/contracts/src/index';
import type { DecisionRecord, HandRecord } from '../../packages/contracts/src/index';
import type { ActiveSession } from '../../packages/persistence/src/index';

const yourDecision = (page: Page) => page.getByRole('heading', { name: 'Your decision', exact: true });
const handComplete = (page: Page) => page.getByRole('heading', { name: 'Hand complete', exact: true });
/** Hero to act with controls enabled: not saving and not waiting for the bot. */
const heroReady = (page: Page) => page.locator('button:enabled', { hasText: /^(Call|Check)/ });
const decisionRows = (page: Page) => page.locator('ol li');
/**
 * Wait budget for one real-worker bot turn to settle. The worker's own 5 s timeout still
 * applies (a slower bot surfaces as "Retry bot" and fails the test); this only stops the
 * default 5 s expect timeout from racing that worker timeout on a loaded machine.
 */
const BOT_TURN = { timeout: 15_000 };
/** Lets the Play keyboard listener (re-registered after each render) catch up with the DOM. */
async function afterPaint(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0))));
}

/** Reads one store of the app's IndexedDB database from the page. */
async function readStore<T>(page: Page, store: 'active' | 'hands'): Promise<T[]> {
  return page.evaluate(name => new Promise<T[]>((resolve, reject) => {
    const request = indexedDB.open('poker-practice');
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction(name, 'readonly').objectStore(name).getAll();
      get.onsuccess = () => { db.close(); resolve(get.result as T[]); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
    request.onerror = () => reject(request.error);
  }), store);
}
async function activeSession(page: Page): Promise<ActiveSession | undefined> {
  return (await readStore<ActiveSession>(page, 'active'))[0];
}
async function savedHands(page: Page): Promise<HandRecord[]> {
  const rows = await readStore<{ record: HandRecord }>(page, 'hands');
  return rows.map(r => r.record).sort((a, b) => a.sequence - b.sequence);
}

/**
 * Seeds an active hand in which the hero holds the button and the bot holds As Ah,
 * using the real recovery store, then opens the table at the hero's first decision.
 */
async function seedStrongBotHand(page: Page): Promise<void> {
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
  await expect(yourDecision(page)).toBeVisible();
  await expect(heroReady(page)).toBeVisible();
}

/** Plays the current hand to completion with mouse clicks. `fold` folds at the first chance. */
async function finishHand(page: Page, style: 'passive' | 'fold'): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await expect(handComplete(page).or(heroReady(page)).first()).toBeVisible(BOT_TURN);
    if (await handComplete(page).isVisible()) return;
    const fold = page.getByRole('button', { name: /^Fold/ });
    if (style === 'fold' && await fold.isEnabled()) await fold.click();
    else await page.getByRole('button', { name: /^(Call|Check)/ }).click();
  }
  throw new Error('Hand did not finish');
}

/** Deals the next hand and waits until the previous hand's completed view is gone. */
async function dealNext(page: Page): Promise<void> {
  const previous = await page.getByRole('link', { name: 'Review hand' }).getAttribute('href');
  await page.getByRole('button', { name: 'Next hand' }).click();
  await expect(page.locator(`a[href="${previous}"]`)).toHaveCount(0);
  await expect(handComplete(page).or(heroReady(page)).first()).toBeVisible(BOT_TURN);
}

/** Which seat the table labels as Dealer ("You" or "Practice bot"). */
async function dealerLabel(page: Page): Promise<string> {
  const label = page.getByText(/· Dealer$/);
  await expect(label).toHaveCount(1);
  return label.evaluate(el => el.parentElement?.querySelector('strong')?.textContent ?? '');
}

/** Delays every bot request so input during the bot turn cannot reach a new hero decision. */
async function delayBotWorker(page: Page, ms: number): Promise<void> {
  await page.addInitScript(delay => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      postMessage(message: unknown): void { setTimeout(() => super.postMessage(message), delay); }
    };
  }, ms);
}

const heroDecisions = (decisions: readonly DecisionRecord[]) => decisions.filter(d => d.frame.actor === 'hero');

test('a hand played check/call reaches showdown and reveals the bot cards', async ({ page }) => {
  test.slow();
  await seedStrongBotHand(page);
  await finishHand(page, 'passive');
  await expect(page.getByText('Showdown · Bot wins', { exact: true })).toBeVisible();
  // Bot hole cards are face up at showdown: only the two seeded aces, no hidden cards left.
  await expect(page.getByLabel('A ♠', { exact: true })).toHaveCount(1);
  await expect(page.getByLabel('A ♥', { exact: true })).toHaveCount(1);
  await expect(page.getByLabel('Hidden card', { exact: true })).toHaveCount(0);
  const hands = await savedHands(page);
  expect(hands).toHaveLength(1);
  expect(hands[0]!.reachedShowdown).toBe(true);
  expect(hands[0]!.heroWonShowdown).toBe(false);
  expect(hands[0]!.botHole).toEqual([textToCard('As'), textToCard('Ah')]);
  expect(hands[0]!.finalBoard).toHaveLength(5);
  expect(hands[0]!.decisions).toHaveLength(await decisionRows(page).count());
  await page.getByRole('link', { name: 'Review hand' }).click();
  await page.getByText('Reveal completed-hand outcome').click();
  await expect(page.getByText(/Bot at showdown: As Ah/)).toBeVisible();
});

test('a hand ending in a fold keeps the bot cards hidden and saves one fold', async ({ page }) => {
  await page.goto('/play');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(heroReady(page)).toBeVisible();
  await page.getByRole('button', { name: /^Fold/ }).click();
  await expect(handComplete(page)).toBeVisible();
  await expect(page.getByText('Hand ended with a fold', { exact: true })).toBeVisible();
  // The hero holds the button on the first hand and folds the 50-chip small blind.
  await expect(page.getByText('−50 chips this hand', { exact: true })).toBeVisible();
  // Two bot cards plus five undealt board cards stay face down.
  await expect(page.getByLabel('Hidden card', { exact: true })).toHaveCount(7);
  await expect(decisionRows(page)).toHaveCount(1);
  const hands = await savedHands(page);
  expect(hands).toHaveLength(1);
  expect(hands[0]!.reachedShowdown).toBe(false);
  expect(hands[0]!.botHole).toBeNull();
  expect(hands[0]!.heroNet).toBe(-50);
  expect(hands[0]!.decisions.map(d => [d.frame.actor, d.action.kind, d.amount])).toEqual([['hero', 'fold', 0]]);
});

test('the dealer button alternates over three consecutive hands', async ({ page }) => {
  test.slow();
  await page.goto('/play');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(handComplete(page).or(heroReady(page)).first()).toBeVisible(BOT_TURN);
  const dealers = [await dealerLabel(page)];
  await finishHand(page, 'fold');
  for (let i = 0; i < 2; i++) {
    await dealNext(page);
    dealers.push(await dealerLabel(page));
    await finishHand(page, 'fold');
  }
  expect(dealers).toEqual(['You', 'Practice bot', 'You']);
  const hands = await savedHands(page);
  expect(hands.map(h => h.sequence)).toEqual([0, 1, 2]);
  expect(hands.map(h => h.button)).toEqual(['hero', 'bot', 'hero']);
});

test('reloading mid-hand restores the same hand state and play continues', async ({ page }) => {
  test.slow();
  await seedStrongBotHand(page);
  await page.getByRole('button', { name: /^Call/ }).click();
  // Wait for the bot's reply, so the hero is to act again with decisions already saved.
  await expect(heroReady(page)).toBeVisible(BOT_TURN);
  await expect(decisionRows(page)).not.toHaveCount(0);
  const tableBefore = await page.locator('main').innerText();
  const savedBefore = await activeSession(page);
  expect(savedBefore!.decisions.length).toBeGreaterThanOrEqual(2);
  await page.reload();
  await expect(yourDecision(page)).toBeVisible();
  await expect(heroReady(page)).toBeVisible();
  // Board, stacks, pot, street, hero cards and the action list are unchanged.
  expect(await page.locator('main').innerText()).toBe(tableBefore);
  await expect(decisionRows(page)).toHaveCount(savedBefore!.decisions.length);
  expect(await activeSession(page)).toEqual(savedBefore);
  await finishHand(page, 'passive');
  const hands = await savedHands(page);
  expect(hands).toHaveLength(1);
  expect(hands[0]!.decisions.slice(0, savedBefore!.decisions.length)).toEqual(savedBefore!.decisions);
});

test('five rapid clicks on Call within 500 ms record exactly one decision', async ({ page }) => {
  await delayBotWorker(page, 1_500);
  await seedStrongBotHand(page);
  const elapsed = await page.evaluate(async () => {
    const start = performance.now();
    for (let i = 0; i < 5; i++) {
      const call = [...document.querySelectorAll('button')].find(b => b.textContent?.startsWith('Call'));
      call?.click();
      if (i < 4) await new Promise(r => setTimeout(r, 100));
    }
    return performance.now() - start;
  });
  expect(elapsed).toBeLessThan(500);
  await expect(page.getByRole('heading', { name: 'Bot is thinking…' })).toBeVisible();
  await expect(page.getByText('You · preflop', { exact: true })).toHaveCount(1);
  // After the delayed bot reply, the hero is to act again with one hero decision saved.
  await expect(heroReady(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('ol li', { hasText: /^You ·/ })).toHaveCount(1);
  const saved = await activeSession(page);
  expect(heroDecisions(saved!.decisions).map(d => [d.action.kind, d.amount])).toEqual([['call', 50]]);
  await expect(decisionRows(page)).toHaveCount(saved!.decisions.length);
});

test('five rapid C key presses within 500 ms record exactly one decision', async ({ page }) => {
  await delayBotWorker(page, 1_500);
  await seedStrongBotHand(page);
  const elapsed = await page.evaluate(async () => {
    const start = performance.now();
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }));
      if (i < 4) await new Promise(r => setTimeout(r, 100));
    }
    return performance.now() - start;
  });
  expect(elapsed).toBeLessThan(500);
  await expect(page.getByRole('heading', { name: 'Bot is thinking…' })).toBeVisible();
  await expect(page.getByText('You · preflop', { exact: true })).toHaveCount(1);
  await expect(heroReady(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('ol li', { hasText: /^You ·/ })).toHaveCount(1);
  const saved = await activeSession(page);
  expect(heroDecisions(saved!.decisions).map(d => [d.action.kind, d.amount])).toEqual([['call', 50]]);
  await expect(decisionRows(page)).toHaveCount(saved!.decisions.length);
});

test('a complete hand can be played with the keyboard only', async ({ page }) => {
  test.slow();
  await page.goto('/play');
  const deal = page.getByRole('button', { name: 'Deal the first hand' });
  await expect(deal).toBeEnabled();
  for (let i = 0; i < 15 && !await deal.evaluate(el => el === document.activeElement); i++) await page.keyboard.press('Tab');
  await expect(deal).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(heroReady(page)).toBeVisible();
  // R focuses the raise amount (preset to the minimum raise), Tab reaches Raise, Enter submits.
  const amount = page.getByRole('spinbutton', { name: 'Bet / raise to' });
  await afterPaint(page);
  await page.keyboard.press('r');
  await expect(amount).toBeFocused();
  await expect(amount).toHaveValue('200');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Raise', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Bet / raise to 200', { exact: true })).toBeVisible();
  // Then C (check/call) on every later hero decision until the hand ends.
  for (let i = 0; i < 50 && !await handComplete(page).isVisible(); i++) {
    await expect(handComplete(page).or(heroReady(page)).first()).toBeVisible(BOT_TURN);
    if (await handComplete(page).isVisible()) break;
    const rows = await decisionRows(page).count();
    await afterPaint(page);
    await page.keyboard.press('c');
    await expect(decisionRows(page)).not.toHaveCount(rows);
  }
  await expect(handComplete(page)).toBeVisible();
  const hands = await savedHands(page);
  expect(hands).toHaveLength(1);
  const hero = heroDecisions(hands[0]!.decisions);
  expect(hero[0]!.action).toEqual({ kind: 'raiseTo', amount: 200 });
  expect(hero.slice(1).every(d => d.action.kind === 'check' || d.action.kind === 'call')).toBe(true);
  expect(hands[0]!.decisions).toHaveLength(await decisionRows(page).count());
});
