#!/usr/bin/env node
// Live smoke check for a deployed site (Req 12).
//
// 1. Fetches each SMOKE_PATHS entry directly with a 10 s timeout: HTTP 200, HTML, a
//    same-origin entry module script, the Requirement 8 CSP, nosniff and no-referrer.
// 2. In a fresh Chromium context (no saved app data), records every request and response:
//    - fails on any request to a foreign origin (Req 12.3);
//    - fails on any same-origin response without nosniff/no-referrer, or an HTML
//      response without the CSP (Req 12.5);
//    - polls /about for up to 90 s until the build commit matches --commit (Req 12.4);
//    - plays one hand with check/call within 120 s, opens its review and confirms the
//      first History row is that hand with the same result (Req 12.2).
// 3. Prints one PASS/FAIL line per step with URL, expected and observed values and exits
//    0 only if every step passed (Req 12.6, 12.7).
//
// Usage: pnpm smoke:live --url https://poker-practice.marton-kadi.workers.dev --commit <sha>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  COMMIT_POLL_TIMEOUT_MS,
  FETCH_TIMEOUT_MS,
  HAND_TIMEOUT_MS,
  MIN_COMMIT_PREFIX,
  SMOKE_PATHS,
  commitMatches,
  entryScript,
  exitCode,
  foreignOrigins,
  formatResult,
  headerProblems,
  isHtmlContentType,
  normalizeHeaders,
  pageProblems,
  parseArgs,
  parseBuildCommit,
  parseReviewResult
} from './smoke-live-lib.mjs';

const COMMIT_POLL_INTERVAL_MS = 5_000;
const UI_STEP_TIMEOUT_MS = 30_000;
const FETCH_EXPECTED = '200 text/html with a same-origin entry module script, Requirement 8 CSP, nosniff, no-referrer';

const message = (error) => (error instanceof Error ? error.message.split('\n')[0] : String(error));

/** Step 1: direct requests without in-app navigation (Req 12.1, 12.5). */
async function fetchStep(origin, pathname) {
  const url = new URL(pathname, `${origin}/`).href;
  const step = `fetch ${pathname}`;
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    const body = await response.text();
    const headers = normalizeHeaders(response.headers);
    const problems = pageProblems({ status: response.status, headers, body, siteOrigin: origin });
    const entry = entryScript(body, origin);
    const observed = problems.length === 0
      ? `${response.status} ${headers['content-type']}, entry ${entry}, headers ok`
      : problems.join('; ');
    return { step, url, expected: FETCH_EXPECTED, observed, pass: problems.length === 0 };
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    const observed = timedOut ? `no response within ${FETCH_TIMEOUT_MS / 1000} s` : `request failed: ${message(error?.cause ?? error)}`;
    return { step, url, expected: FETCH_EXPECTED, observed, pass: false };
  }
}

/** Polls /about until the displayed build commit matches (Req 12.4). */
async function aboutStep(page, origin, commit) {
  const url = new URL('/about', `${origin}/`).href;
  const expected = `build commit ${commit} or a prefix of it with at least ${MIN_COMMIT_PREFIX} characters (within ${COMMIT_POLL_TIMEOUT_MS / 1000} s)`;
  const deadline = Date.now() + COMMIT_POLL_TIMEOUT_MS;
  let observed = 'About page not loaded';
  for (;;) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: Math.max(1_000, deadline - Date.now()) });
      const line = page.getByText(/Build commit:/);
      await line.first().waitFor({ state: 'visible', timeout: Math.max(1_000, Math.min(UI_STEP_TIMEOUT_MS, deadline - Date.now())) });
      const shown = parseBuildCommit(await line.first().innerText());
      observed = shown === null ? 'no build commit value shown' : `build commit ${shown}`;
      if (commitMatches(shown, commit)) return { step: 'about commit', url, expected, observed, pass: true };
    } catch (error) {
      observed = `About page error: ${message(error)}`;
    }
    if (Date.now() + COMMIT_POLL_INTERVAL_MS >= deadline) break;
    await page.waitForTimeout(COMMIT_POLL_INTERVAL_MS);
  }
  return { step: 'about commit', url, expected, observed: `${observed} after ${COMMIT_POLL_TIMEOUT_MS / 1000} s`, pass: false };
}

/** Plays one hand with check/call until it completes (Req 12.2). */
async function playStep(page, origin) {
  const url = new URL('/', `${origin}/`).href;
  const expected = `one hand completes (showdown or fold) within ${HAND_TIMEOUT_MS / 1000} s`;
  const deadline = Date.now() + HAND_TIMEOUT_MS;
  const remaining = () => Math.max(1, deadline - Date.now());
  try {
    await page.goto(url, { waitUntil: 'load', timeout: remaining() });
    await page.getByRole('link', { name: 'Start playing' }).click({ timeout: remaining() });
    await page.getByRole('button', { name: 'Deal the first hand' }).click({ timeout: remaining() });
    const complete = page.getByRole('heading', { name: 'Hand complete', exact: true });
    const heroReady = page.locator('button:enabled', { hasText: /^(Call|Check)/ });
    const alert = page.getByRole('alert');
    for (;;) {
      await complete.or(heroReady).or(alert).first().waitFor({ state: 'visible', timeout: remaining() });
      if (await alert.count()) throw new Error(`app error: ${(await alert.first().innerText()).trim()}`);
      if (await complete.isVisible()) break;
      await heroReady.first().click({ timeout: remaining() });
    }
    const amount = (await page.locator('p', { hasText: / this hand$/ }).first().innerText({ timeout: remaining() })).trim();
    const reviewHref = await page.getByRole('link', { name: 'Review hand' }).getAttribute('href', { timeout: remaining() });
    if (!reviewHref) throw new Error('no "Review hand" link after the hand completed');
    const seconds = ((HAND_TIMEOUT_MS - (deadline - Date.now())) / 1000).toFixed(1);
    return { result: { step: 'play hand', url, expected, observed: `hand complete in ${seconds} s: ${amount}`, pass: true }, reviewHref };
  } catch (error) {
    return { result: { step: 'play hand', url, expected, observed: message(error), pass: false }, reviewHref: null };
  }
}

/** Opens the hand's review, reads its result and compares the first History row (Req 12.2). */
async function reviewHistoryStep(page, origin, reviewHref) {
  const url = new URL(reviewHref, `${origin}/`).href;
  const step = 'review matches history';
  let reviewResult = null;
  try {
    await page.getByRole('link', { name: 'Review hand' }).click({ timeout: UI_STEP_TIMEOUT_MS });
    await page.waitForURL(url, { timeout: UI_STEP_TIMEOUT_MS });
    await page.getByRole('heading', { name: /^Decision 1 of \d+$/ }).waitFor({ timeout: UI_STEP_TIMEOUT_MS });
    await page.getByText('Reveal completed-hand outcome').click({ timeout: UI_STEP_TIMEOUT_MS });
    const outcome = page.locator('p', { hasText: /^Final board:/ }).first();
    reviewResult = parseReviewResult(await outcome.innerText({ timeout: UI_STEP_TIMEOUT_MS }));
    if (!reviewResult) throw new Error('no result in the review outcome');

    await page.getByRole('navigation').getByRole('link', { name: 'History', exact: true }).click({ timeout: UI_STEP_TIMEOUT_MS });
    const row = page.locator('article').first();
    await row.waitFor({ state: 'visible', timeout: UI_STEP_TIMEOUT_MS });
    const historyHref = await row.getByRole('link').first().getAttribute('href');
    const historyResult = (await row.locator(':scope > strong').last().innerText()).trim();
    const pass = historyHref === reviewHref && historyResult === reviewResult;
    return {
      step,
      url,
      expected: `first History row links ${reviewHref} with result ${reviewResult}`,
      observed: `first History row links ${historyHref} with result ${historyResult}`,
      pass
    };
  } catch (error) {
    const expected = reviewResult
      ? `first History row links ${reviewHref} with result ${reviewResult}`
      : 'review outcome result equals the first History row result';
    return { step, url, expected, observed: message(error), pass: false };
  }
}

/** Step 2: everything that runs in Chromium. */
async function browserSteps(origin, commit) {
  const results = [];
  const requested = [];
  const headerFailures = [];
  const pendingHeaders = [];
  let checkedResponses = 0;
  let browser;
  try {
    const { chromium } = await import('@playwright/test');
    browser = await chromium.launch();
    const context = await browser.newContext();
    context.on('request', (request) => requested.push(request.url()));
    context.on('response', (response) => {
      const responseUrl = response.url();
      let sameOrigin = false;
      try { sameOrigin = new URL(responseUrl).origin === origin; } catch { /* reported as foreign */ }
      if (!sameOrigin) return;
      pendingHeaders.push(response.allHeaders().then((headers) => {
        checkedResponses += 1;
        const html = isHtmlContentType(headers['content-type']);
        const problems = headerProblems(headers, { html });
        if (problems.length) headerFailures.push(`${new URL(responseUrl).pathname} (${response.status()}): ${problems.join(', ')}`);
      }, (error) => headerFailures.push(`${responseUrl}: headers unreadable (${message(error)})`)));
    });
    const page = await context.newPage();

    results.push(await aboutStep(page, origin, commit));
    const { result, reviewHref } = await playStep(page, origin);
    results.push(result);
    if (reviewHref) results.push(await reviewHistoryStep(page, origin, reviewHref));
    else results.push({ step: 'review matches history', url: origin, expected: 'a completed hand to review', observed: 'skipped: no hand completed', pass: false });

    await Promise.allSettled(pendingHeaders);
    await context.close();
  } catch (error) {
    results.push({ step: 'browser', url: origin, expected: 'Chromium runs the browser steps', observed: message(error), pass: false });
  } finally {
    await browser?.close().catch(() => {});
  }

  const foreign = foreignOrigins(requested, origin);
  results.push({
    step: 'browser request origins',
    url: origin,
    expected: `every request goes to ${origin}`,
    observed: foreign.length === 0 ? `${requested.length} requests, all to ${origin}` : `foreign origins: ${foreign.join(', ')}`,
    pass: requested.length > 0 && foreign.length === 0
  });
  results.push({
    step: 'browser response headers',
    url: origin,
    expected: 'every response has nosniff and no-referrer; HTML responses have the Requirement 8 CSP',
    observed: headerFailures.length > 0
      ? headerFailures.join('; ')
      : checkedResponses === 0 ? 'no responses received from the site' : `${checkedResponses} responses checked, headers ok`,
    pass: checkedResponses > 0 && headerFailures.length === 0
  });
  return results;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`smoke:live: ${message(error)}`);
    console.error('Usage: pnpm smoke:live --url <https://site> --commit <sha>');
    return 1;
  }
  const { origin, commit } = options;
  console.log(`smoke:live: ${origin} expecting commit ${commit}`);
  const results = [];
  const report = (result) => { results.push(result); console.log(formatResult(result)); };

  for (const pathname of SMOKE_PATHS) report(await fetchStep(origin, pathname));
  for (const result of await browserSteps(origin, commit)) report(result);

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0
    ? `smoke:live: PASS all ${results.length} steps`
    : `smoke:live: FAIL ${failed} of ${results.length} steps`);
  return exitCode(results);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }, (error) => {
    console.error(`smoke:live: FAIL ${error?.stack ?? error}`);
    process.exitCode = 1;
  });
}
