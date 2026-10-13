// Browser tests: what the app offers, the opponent label and the chip unit.
//
// - Deferred-feature paths render the same not-found view as any unknown path.
// - No page reachable from home shows a control for a deferred feature, or a forbidden
//   claim ("GTO", "solver", "EV loss", strength/skill), except in explicit denials.
// - The opponent is labelled "standard-v1" and "experimental" on Play and About.
// - Toggling "Show bb" changes Play and History amounts within 1 s and survives a reload.
//
// Helpers are copied from the other spec files on purpose: importing a spec file would
// register its tests a second time.
import type { Locator } from '@playwright/test';
import { test, expect, type Page } from './fixtures';

const yourDecision = (page: Page) => page.getByRole('heading', { name: 'Your decision', exact: true });
const handComplete = (page: Page) => page.getByRole('heading', { name: 'Hand complete', exact: true });
/** Hero to act with controls enabled: not saving and not waiting for the bot. */
const heroReady = (page: Page) => page.locator('button:enabled', { hasText: /^(Call|Check)/ });
/** Wait budget for one real-worker bot turn (see gameplay.spec.ts). */
const BOT_TURN = { timeout: 15_000 };
/** The new unit must show within 1 second, without a reload. */
const WITHIN_1S = { timeout: 1_000 };

// ---------------------------------------------------------------------------
// Forbidden controls and forbidden terms
// ---------------------------------------------------------------------------

/**
 * A visible control whose text, label, title, name, id or link target matches this
 * pattern would offer a deferred feature: sign-in/accounts, sync, archive import,
 * difficulty selection, animation speed, equity estimates or action recommendations.
 */
const FORBIDDEN_CONTROL = /sign[\s-]?(in|up|out)|log[\s-]?(in|out)|oauth|\bauth\b|account|\bsync|import|difficult|\blevel\b|animation|speed|equity|recommend|suggest|\bhint|coach|advice|solver|\bgto\b/i;

/** Terms that must not be displayed except in an explicit denial. */
const FORBIDDEN_TERMS: readonly RegExp[] = [
  /\bGTO\b/i,
  /\bgame[\s-]theory[\s-]optimal\b/i,
  /\bsolvers?\b/i,
  /\bEV[\s-]?loss(es)?\b/i,
  // Claims of opponent strength or skill level.
  /\b(strong(er|est)?|strength|skill(s|ed|ful)?|expert|elite|unbeatable|world[\s-]class|pro(fessional)?[\s-]level|optimal(ly)?|grandmaster|hard[\s-]mode)\b/i
];
const NEGATION = /\b(not|no|never|nor|cannot|can't|doesn't|isn't|without)\b/i;

/**
 * Returns every clause of `text` that contains a forbidden term and is not an explicit
 * denial. Text is split into sentences, then into clauses at commas, semicolons, colons
 * and the conjunctions "and"/"but", so a denial in one clause cannot excuse a claim in
 * another ("Not a toy, an expert bot" is flagged). A clause counts as a denial only if
 * it itself contains a negation word ("It is not a solved GTO opponent").
 */
function forbiddenClaims(text: string): string[] {
  const clauses = text
    .split(/(?<=[.!?])\s+|\n+/)
    .flatMap(sentence => sentence.split(/[,;:·]|\s(?:and|but)\s/i))
    .map(c => c.trim())
    .filter(Boolean);
  return clauses.filter(clause => FORBIDDEN_TERMS.some(term => term.test(clause)) && !NEGATION.test(clause));
}

/** Describes every visible interactive element on the page (text, label and target). */
async function visibleControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector = 'a, button, input, select, textarea, summary, label, option, [role="button"], [role="link"], [role="menu"], [role="menuitem"], [role="tab"], [role="option"], [role="switch"], [role="checkbox"], [role="combobox"], [role="slider"], [tabindex]';
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter(el => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      })
      .map(el => [
        el.tagName.toLowerCase(),
        el.innerText?.trim(),
        el.getAttribute('aria-label'),
        el.getAttribute('title'),
        el.getAttribute('name'),
        el.id,
        el.getAttribute('href'),
        el.getAttribute('placeholder'),
        el.getAttribute('value')
      ].filter(Boolean).join(' | '));
  });
}

/** Asserts the current page shows no forbidden control and no forbidden claim. */
async function expectInScope(page: Page, label: string): Promise<void> {
  const controls = await visibleControls(page);
  expect(controls.length, `${label}: controls were found`).toBeGreaterThan(0);
  expect(controls.filter(c => FORBIDDEN_CONTROL.test(c)), `${label}: forbidden controls`).toEqual([]);
  // innerText is the rendered, visible text (collapsed <details> content is excluded).
  const text = await page.locator('body').innerText();
  expect(forbiddenClaims(text), `${label}: forbidden terms`).toEqual([]);
  expect(forbiddenClaims(await page.title()), `${label}: forbidden terms in title`).toEqual([]);
}

/** Plays the current hand to completion by checking or calling, scanning each hero decision. */
async function finishPassively(page: Page, onDecision: () => Promise<void>): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await expect(handComplete(page).or(heroReady(page)).first()).toBeVisible(BOT_TURN);
    if (await handComplete(page).isVisible()) return;
    await onDecision();
    await page.getByRole('button', { name: /^(Call|Check)/ }).click();
  }
  throw new Error('Hand did not finish');
}

test('the term check is narrow: claims are flagged, only explicit denials pass', () => {
  expect(forbiddenClaims('A GTO opponent.')).toEqual(['A GTO opponent.']);
  expect(forbiddenClaims('Built on a solver.')).toHaveLength(1);
  expect(forbiddenClaims('Shows your EV loss for each hand.')).toHaveLength(1);
  expect(forbiddenClaims('Game theory optimal play.')).toHaveLength(1);
  expect(forbiddenClaims('A strong, expert-level opponent.')).toHaveLength(2);
  // A denial in one clause does not excuse a claim in another.
  expect(forbiddenClaims('Not a toy, a GTO bot.')).toEqual(['a GTO bot.']);
  expect(forbiddenClaims('It is not GTO but it is a strong bot.')).toEqual(['it is a strong bot.']);
  // Explicit denials (the About page wording) pass.
  expect(forbiddenClaims('It is not a solved GTO opponent and its strength has not been established.')).toEqual([]);
  expect(forbiddenClaims('It does not grade decisions or calculate EV loss.')).toEqual([]);
  expect(forbiddenClaims('not GTO')).toEqual([]);
  expect(FORBIDDEN_CONTROL.test('button | Sign in with Google')).toBe(true);
  expect(FORBIDDEN_CONTROL.test('a | Import | /import')).toBe(true);
  expect(FORBIDDEN_CONTROL.test('select | Difficulty')).toBe(true);
  expect(FORBIDDEN_CONTROL.test('button | Fold F')).toBe(false);
});

test('deferred feature paths render the same not-found view as an unknown path', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  const reference = await page.locator('main').innerHTML();
  for (const path of ['/signin', '/sync', '/import', '/auth/callback']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Page not found' }), path).toBeVisible();
    expect(await page.locator('main').innerHTML(), `${path} main content`).toBe(reference);
  }
});

test('no page reachable from home shows deferred-feature controls or forbidden terms', async ({ page }) => {
  test.slow();
  const routes: Array<{ path: string; ready: (p: Page) => Locator }> = [
    { path: '/', ready: p => p.getByRole('heading', { name: 'Play the hand. Study the decision.' }) },
    { path: '/play', ready: p => p.getByRole('button', { name: 'Deal the first hand' }) },
    { path: '/history', ready: p => p.getByText('No completed hands yet.') },
    { path: '/settings', ready: p => p.getByRole('heading', { name: 'Settings', exact: true }) },
    { path: '/about', ready: p => p.getByRole('heading', { name: 'Practice with clear limits' }) },
    { path: '/no-such-page', ready: p => p.getByRole('heading', { name: 'Page not found' }) }
  ];
  // Every in-app link on the home page leads to one of the routes scanned here.
  await page.goto('/');
  await expect(routes[0]!.ready(page)).toBeVisible();
  const homeLinks = await page.locator('a[href^="/"]').evaluateAll(links => links.map(a => a.getAttribute('href')!));
  expect(homeLinks.length).toBeGreaterThan(0);
  for (const href of homeLinks) expect(['/', '/play', '/history', '/settings', '/about'], `home link ${href}`).toContain(href);

  for (const route of routes) {
    await page.goto(route.path);
    await expect(route.ready(page)).toBeVisible();
    await expectInScope(page, route.path);
  }

  // The table at every hero decision of a real-worker hand, then the completed hand.
  // The first hand has the hero on the button, so the hero acts before the bot can end it.
  await page.goto('/play');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(yourDecision(page)).toBeVisible();
  let decisions = 0;
  await finishPassively(page, async () => { decisions++; await expectInScope(page, `/play hero decision ${decisions}`); });
  expect(decisions).toBeGreaterThan(0);
  await expectInScope(page, '/play hand complete');

  // History with a saved hand, then every review decision with the outcome collapsed and opened.
  const review = await page.getByRole('link', { name: 'Review hand' }).getAttribute('href');
  await page.goto('/history');
  await expect(page.locator('article')).toHaveCount(1);
  await expectInScope(page, '/history with a hand');
  await page.goto(review!);
  const heading = page.getByRole('heading', { name: /^Decision \d+ of \d+$/ });
  await expect(heading).toBeVisible();
  const total = Number((await heading.innerText()).match(/of (\d+)$/)![1]);
  for (let i = 1; i <= total; i++) {
    await expect(page.getByRole('heading', { name: `Decision ${i} of ${total}` })).toBeVisible();
    await expect(page.getByText(/^Final board:/)).toHaveCount(0);
    await expectInScope(page, `review decision ${i} (outcome collapsed)`);
    if (i < total) await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.getByText('Reveal completed-hand outcome').click();
  await expect(page.getByText(/^Final board:/)).toBeVisible();
  await expectInScope(page, 'review (outcome open)');
});

test('the opponent is labelled standard-v1 experimental on Play and About', async ({ page }) => {
  await page.goto('/play');
  await expect(page.getByTestId('opponent-label')).toHaveText('standard-v1 · experimental');
  await expect(page.locator('main')).toContainText('standard-v1');
  await expect(page.locator('main')).toContainText(/experimental/i);
  await page.goto('/about');
  await expect(page.getByRole('heading', { name: 'Practice with clear limits' })).toBeVisible();
  await expect(page.locator('main')).toContainText('standard-v1');
  await expect(page.locator('main')).toContainText(/experimental/i);
  await expect(page.getByText('Opponent: standard-v1 · experimental', { exact: false })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Chip unit
// ---------------------------------------------------------------------------

const CHIPS = /(\d[\d,]*) chips/g;
const BB = /(\d+\.\d) bb/g;
const amounts = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map(m => m[1]!);
const asBb = (chips: string) => `${(Number(chips.replace(/,/g, '')) / 100).toFixed(1)}`;

/** Reads the stored chip-unit preference from the app's IndexedDB (test tooling only). */
async function storedChipsAsBb(page: Page): Promise<boolean | undefined> {
  return page.evaluate(() => new Promise<boolean | undefined>((resolve, reject) => {
    const request = indexedDB.open('poker-practice');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('preferences', 'readonly').objectStore('preferences').getAll();
      get.onsuccess = () => { db.close(); resolve((get.result as Array<{ chipsAsBb: boolean }>)[0]?.chipsAsBb); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  }));
}

test('Show bb switches Play and History amounts within 1 s and survives a reload', async ({ page }) => {
  const showBb = page.getByLabel('Show bb');
  const main = page.locator('main');
  // The table's pot readout: <div>POT <strong>amount</strong></div>.
  const pot = page.locator('xpath=//main//div[starts-with(normalize-space(.), "POT ")]/strong');
  await page.goto('/play');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await expect(yourDecision(page)).toBeVisible();
  await expect(heroReady(page)).toBeVisible();
  await expect(showBb).not.toBeChecked();

  // Stacks, street bets, pot, call price, presets and all-in, all in chips.
  const chipAmounts = amounts(await main.innerText(), CHIPS);
  expect(chipAmounts.length).toBeGreaterThanOrEqual(6);
  await expect(pot).toHaveText(/^\d[\d,]* chips$/);
  await expect(page.getByText(/^In this street: \d[\d,]* chips$/)).toHaveCount(2);

  // Toggle to bb: every amount converts within 1 s, no chip amount remains, no reload.
  // The marker lives in the page's JS realm, so a reload would remove it.
  await page.evaluate(() => { (window as unknown as Record<string, boolean>).__scopeNoReload = true; });
  await showBb.check();
  await expect.poll(async () => amounts(await main.innerText(), CHIPS), WITHIN_1S).toEqual([]);
  expect(amounts(await main.innerText(), BB)).toEqual(chipAmounts.map(asBb));
  await expect(pot).toHaveText(/^\d+\.\d bb$/);
  await expect(page.getByText(/^In this street: \d+\.\d bb$/)).toHaveCount(2);
  await expect(page.getByRole('button', { name: /^Call \d+\.\d bb/ })).toBeVisible();

  // Fold: the hero holds the button and loses the 50-chip small blind.
  await page.getByRole('button', { name: /^Fold/ }).click();
  await expect(handComplete(page)).toBeVisible();
  await expect(page.getByText('−0.5 bb this hand', { exact: true })).toBeVisible();

  // History (in-app navigation, no reload) shows the same unit within 1 s.
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.locator('article strong').last()).toHaveText('−0.5 bb', WITHIN_1S);
  expect(await page.evaluate(() => (window as unknown as Record<string, boolean>).__scopeNoReload), 'the unit change must not reload the page').toBe(true);

  // The choice survives a reload, on History and on Play.
  await expect.poll(() => storedChipsAsBb(page)).toBe(true);
  await page.reload();
  await expect(page.locator('article strong').last()).toHaveText('−0.5 bb');
  await page.goto('/play');
  await expect(handComplete(page)).toBeVisible();
  await expect(showBb).toBeChecked();
  await expect(page.getByText('−0.5 bb this hand', { exact: true })).toBeVisible();
  expect(amounts(await main.innerText(), CHIPS)).toEqual([]);

  // Back to chips: Play and History follow within 1 s, and that also survives a reload.
  await showBb.uncheck();
  await expect(page.getByText('−50 chips this hand', { exact: true })).toBeVisible(WITHIN_1S);
  expect(amounts(await main.innerText(), BB)).toEqual([]);
  await page.getByRole('link', { name: 'History', exact: true }).click();
  await expect(page.locator('article strong').last()).toHaveText('−50 chips', WITHIN_1S);
  await expect.poll(() => storedChipsAsBb(page)).toBe(false);
  await page.reload();
  await expect(page.locator('article strong').last()).toHaveText('−50 chips');
});
