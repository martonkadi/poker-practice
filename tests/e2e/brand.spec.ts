// Visible brand checks: every route
// shows the HeadsUp header link and document title, no route shows the legacy
// product name in visible text, the title or accessible names, and the served
// first-party license names HeadsUp contributors. Internal identifiers such as
// the IndexedDB name and the export format id are not user-visible and are
// covered by the data tests.
import type { Locator } from '@playwright/test';
import { test, expect, type Page } from './fixtures';

const LEGACY = /poker\s*practice/i;

const brandLink = (page: Page) => page.getByRole('banner').getByRole('link', { name: '♠ HeadsUp', exact: true });

/** Visible text, document title and accessible-name attributes of the current page. */
async function visibleNames(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    const out = [document.body.innerText, document.title];
    for (const el of Array.from(document.querySelectorAll('[aria-label], [title], [alt]'))) {
      for (const attr of ['aria-label', 'title', 'alt']) {
        const value = el.getAttribute(attr);
        if (value) out.push(value);
      }
    }
    return out;
  });
}

/**
 * Finishes the hand that is currently dealt by folding at the hero's first decision.
 * When the bot holds the button it acts first and may fold itself, ending the hand
 * before the hero acts, so either outcome is accepted. (Copied from data-layout.spec.ts.)
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

test('every route shows the HeadsUp brand and title and no legacy name', async ({ page }) => {
  test.slow();
  await page.goto('/play');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
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
    await expect(brandLink(page), `${route.path} header brand`).toBeVisible();
    await expect(page, `${route.path} title`).toHaveTitle('HeadsUp');
    expect((await visibleNames(page)).filter(s => LEGACY.test(s)), `${route.path} legacy name`).toEqual([]);
  }
});

test('the served first-party license names HeadsUp contributors', async ({ request }) => {
  const response = await request.get('/license.txt');
  expect(response.status()).toBe(200);
  const text = await response.text();
  expect(text).toContain('Copyright (c) 2026 HeadsUp contributors');
  expect(text).not.toMatch(LEGACY);
});
