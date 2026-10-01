// Resilience scenarios for the release browser suite (Req 2.2, 2.4, 2.5, 10.4):
// - a Bot_Worker failure (crash or timeout) followed by "Retry bot" completing the bot turn;
// - navigation away during a bot turn, then a return with hero controls enabled;
// - takeover after another tab advanced the hand;
// - a Review_Screen route with an unknown hand id.
//
// Worker overrides are installed with `page.addInitScript` only (test tooling), and hands
// are seeded straight into the app's IndexedDB store. Nothing is added to the app bundle.
import { test, expect, type Page } from './fixtures';
import { createHand, hole } from '../../packages/poker/src/index';
import { textToCard } from '../../packages/contracts/src/index';
import type { ActiveSession } from '../../packages/persistence/src/index';

/** Seeds an active hand with the hero on the button (hero acts first) and the bot holding AA. */
async function seedHand(page: Page): Promise<void> {
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
  await expect(page.getByRole('heading', { name: 'Your decision', exact: true })).toBeVisible();
}

const decisionRows = (page: Page) => page.locator('ol li');
const yourDecision = (page: Page) => page.getByRole('heading', { name: 'Your decision', exact: true });
const handComplete = (page: Page) => page.getByRole('heading', { name: 'Hand complete', exact: true });

/** Hero is the actor, busy is clear and the legal hero controls are enabled. */
async function expectHeroControlsEnabled(page: Page): Promise<void> {
  await expect(yourDecision(page)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Fold/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /^(Check|Call)/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'End session' })).toBeEnabled();
}

/** Waits until the bot turn(s) after a hero action have finished: hero to act again or hand over. */
async function waitForBotTurnToFinish(page: Page, timeout = 20_000): Promise<'hero' | 'complete'> {
  const heroReady = page.locator('button:enabled', { hasText: /^(Call|Check)/ });
  await expect(handComplete(page).or(heroReady).first()).toBeVisible({ timeout });
  return await handComplete(page).isVisible() ? 'complete' : 'hero';
}

/**
 * Wraps the real Worker: records every posted `decide` observation in `window.__decides`,
 * and makes the first bot request fail by `mode` ('crash' fires a worker error event,
 * 'timeout' never answers). Later requests reach the real `standard-v1` worker.
 */
async function installFailingWorker(page: Page, mode: 'crash' | 'timeout'): Promise<void> {
  await page.addInitScript(failure => {
    const Original = window.Worker;
    const w = window as typeof window & { __decides: string[] };
    w.__decides = [];
    let failed = false;
    window.Worker = class extends Original {
      postMessage(message: unknown): void {
        const m = message as { kind?: string; observation?: unknown };
        if (m && m.kind === 'decide') w.__decides.push(JSON.stringify(m.observation));
        if (!failed) {
          failed = true;
          if (failure === 'crash') setTimeout(() => this.dispatchEvent(new Event('error')), 0);
          return;
        }
        super.postMessage(message);
      }
    };
  }, mode);
}

for (const mode of ['crash', 'timeout'] as const) {
  test(`bot worker ${mode} shows Retry bot, and retry completes the bot turn`, async ({ page }) => {
    test.slow(); // The timeout variant waits for the app's 5 s bot timeout under a loaded machine.
    await installFailingWorker(page, mode);
    await seedHand(page);
    await page.getByRole('button', { name: /^Call/ }).click();
    const clickedAt = Date.now();

    // Req 2.4: within 10 s the failure is shown with "Retry bot", busy is clear and the
    // session stays at the state before the request (only the hero's call is saved).
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Bot decision failed.', { timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Retry bot' })).toBeEnabled();
    expect(Date.now() - clickedAt).toBeLessThanOrEqual(10_000);
    await expect(page.getByRole('button', { name: 'End session' })).toBeEnabled();
    await expect(decisionRows(page)).toHaveCount(1);
    await expect(decisionRows(page).first()).toContainText('You · preflop');
    expect(await page.evaluate(() => (window as typeof window & { __decides: string[] }).__decides.length)).toBe(1);

    // Req 2.5: Retry removes the message and sends one new request for the same state.
    await page.getByRole('button', { name: 'Retry bot' }).click();
    await expect(alert).toHaveCount(0);
    const outcome = await waitForBotTurnToFinish(page);
    const decides = await page.evaluate(() => (window as typeof window & { __decides: string[] }).__decides);
    expect(decides.length).toBeGreaterThanOrEqual(2);
    expect(decides[1]).toBe(decides[0]);

    // The bot turn completed and was saved; hero controls are usable again.
    await expect(decisionRows(page).nth(1)).toContainText('Bot · preflop');
    await expect(alert).toHaveCount(0);
    if (outcome === 'hero') await expectHeroControlsEnabled(page);
    else await expect(page.getByRole('button', { name: 'Next hand' })).toBeEnabled();
  });
}

test('navigating away during a bot turn cancels it and returning re-enables hero controls', async ({ page }) => {
  test.slow();
  // Delays every bot request by 3 s before it reaches the real worker, so the turn is still
  // pending when the Guest leaves. Cancellation terminates the worker, so the delayed
  // message from the cancelled request is never answered.
  await page.addInitScript(() => {
    const Original = window.Worker;
    const w = window as typeof window & { __decides: number; __terminated: number };
    w.__decides = 0; w.__terminated = 0;
    window.Worker = class extends Original {
      postMessage(message: unknown): void {
        if ((message as { kind?: string })?.kind === 'decide') w.__decides++;
        setTimeout(() => super.postMessage(message), 3_000);
      }
      terminate(): void { w.__terminated++; super.terminate(); }
    };
  });
  await seedHand(page);
  await page.getByRole('button', { name: /^Call/ }).click();
  await expect(page.getByRole('heading', { name: 'Bot is thinking…' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'End session' })).toBeDisabled(); // Busy while the bot thinks.

  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hand history' })).toBeVisible();
  // Req 2.2: the pending request is cancelled (worker terminated) and no error is shown.
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __terminated: number }).__terminated)).toBeGreaterThan(0);
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.getByRole('link', { name: 'Play', exact: true }).click();
  // Nothing from the cancelled request was saved: only the hero's call is on record.
  await expect(decisionRows(page)).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);

  // The bot turn is requested again for the unchanged session and finishes; controls come back.
  const outcome = await waitForBotTurnToFinish(page, 30_000);
  expect(await page.evaluate(() => (window as typeof window & { __decides: number }).__decides)).toBeGreaterThanOrEqual(2);
  await expect(decisionRows(page).nth(1)).toContainText('Bot · preflop');
  await expect(page.getByRole('alert')).toHaveCount(0);
  if (outcome === 'hero') await expectHeroControlsEnabled(page);
  else await expect(page.getByRole('button', { name: 'Next hand' })).toBeEnabled();
});

test('a waiting tab takes over with the hand state another tab advanced', async ({ page }) => {
  test.slow();
  await seedHand(page);
  const second = await page.context().newPage();
  await second.goto('/play');
  await expect(second.getByText('This session is open in another tab', { exact: false })).toBeVisible();
  await expect(second.getByRole('button', { name: /^Fold/ })).toBeDisabled();
  await expect(second.getByText('No actions yet.')).toBeVisible();

  // The first tab advances the hand: hero call plus the real bot's reply.
  await page.getByRole('button', { name: /^Call/ }).click();
  const outcome = await waitForBotTurnToFinish(page);
  const advanced = await decisionRows(page).allTextContents();
  expect(advanced.length).toBeGreaterThanOrEqual(2);
  const street = await page.getByText(/^(PREFLOP|FLOP|TURN|RIVER)$/).textContent();
  // The waiting tab neither wrote nor re-read while the first tab held the lock.
  await expect(second.locator('ol li')).toHaveCount(0);

  await page.close();
  // Takeover: the second tab loads the latest committed state and becomes writable.
  await expect(second.getByText('This session is open in another tab', { exact: false })).toHaveCount(0);
  await expect(decisionRows(second)).toHaveCount(advanced.length);
  expect(await decisionRows(second).allTextContents()).toEqual(advanced);
  await expect(second.getByText(/^(PREFLOP|FLOP|TURN|RIVER)$/)).toHaveText(street!);
  if (outcome === 'hero') {
    await expectHeroControlsEnabled(second);
    await second.getByRole('button', { name: /^Fold/ }).click();
    await expect(handComplete(second)).toBeVisible();
    await expect(decisionRows(second)).toHaveCount(advanced.length + 1);
  } else {
    await expect(second.getByRole('button', { name: 'Next hand' })).toBeEnabled();
  }
  await second.getByRole('link', { name: 'History', exact: true }).click();
  await expect(second.locator('article')).toHaveCount(1);
  await second.close();
});

test('a review route with an unknown hand id shows Hand unavailable', async ({ page }) => {
  // With no saved hands.
  await page.goto(`/review/${crypto.randomUUID()}`);
  await expect(page.getByRole('heading', { name: 'Hand unavailable' })).toBeVisible();
  await expect(page.getByText('This hand is not saved in this browser.')).toBeVisible();

  // With a saved hand, an unknown id still resolves to the not-found message, not another hand.
  await page.goto('/play');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await page.getByRole('button', { name: /^Fold/ }).click();
  await expect(handComplete(page)).toBeVisible();
  await page.goto('/review/does-not-exist');
  await expect(page.getByRole('heading', { name: 'Hand unavailable' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Decision \d+ of \d+$/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Return to history' }).click();
  await expect(page).toHaveURL('/history');
  await expect(page.locator('article')).toHaveCount(1);
});
