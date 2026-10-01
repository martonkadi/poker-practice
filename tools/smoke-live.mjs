#!/usr/bin/env node
// Live smoke check for a deployed site (Req 12).
//
// 1. Waits for the deployment: in a Chromium context of its own, polls /about for up to
//    90 s until the build commit matches --commit (Req 12.4). Right after `wrangler deploy`
//    returns, Cloudflare's edge can still answer with a bare 404 that is not the app (seen
//    on the first deploy of 9d15c68) or with the previous version. Responses seen while
//    waiting are therefore not header-checked; the checks below run afterwards, against
//    the deployment that shows the expected commit. Request origins are still recorded.
// 2. Fetches each SMOKE_PATHS entry directly, once, with a 10 s timeout: HTTP 200, HTML, a
//    same-origin entry module script, the Requirement 8 CSP, nosniff and no-referrer.
// 3. In a fresh Chromium context (no saved app data), records every request and response:
//    - fails on any request to a foreign origin (Req 12.3);
//    - fails on any same-origin response without nosniff/no-referrer, or an HTML
//      response without the CSP (Req 12.5);
//    - loads /about once and confirms the build commit again (Req 12.4);
//    - plays one hand with check/call within 120 s, opens its review and confirms the
//      first History row is that hand with the same result (Req 12.2).
// 4. Prints one PASS/FAIL line per step with URL, expected and observed values and exits
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

/**
 * Loads /about once and reads the displayed build commit.
 * @returns {Promise<{ shown: string | null, observed: string }>}
 */
async function readAboutCommit(page, url, timeoutMs) {
  const response = await page.goto(url, { waitUntil: 'load', timeout: Math.max(1_000, timeoutMs) });
  const status = response?.status() ?? 0;
  // A non-200 answer is not the app shell: do not wait for text that cannot appear.
  if (status !== 200) return { shown: null, observed: `HTTP ${status} for /about` };
  const line = page.getByText(/Build commit:/);
  await line.first().waitFor({ state: 'visible', timeout: Math.max(1_000, Math.min(UI_STEP_TIMEOUT_MS, timeoutMs)) });
  const shown = parseBuildCommit(await line.first().innerText());
  return { shown, observed: shown === null ? 'no build commit value shown' : `build commit ${shown}` };
}

/**
 * Polls /about until the displayed build commit matches, i.e. until the edge serves the
 * expected deployment (Req 12.4).
 * @returns {Promise<{ pass: boolean, observed: string, seconds: string }>}
 */
async function waitForCommit(page, url, commit) {
  const started = Date.now();
  const deadline = started + COMMIT_POLL_TIMEOUT_MS;
  const seconds = () => ((Date.now() - started) / 1000).toFixed(1);
  let observed = 'About page not loaded';
  for (;;) {
    try {
      const result = await readAboutCommit(page, url, deadline - Date.now());
      observed = result.observed;
      if (commitMatches(result.shown, commit)) return { pass: true, observed, seconds: seconds() };
    } catch (error) {
      observed = `About page error: ${message(error)}`;
    }
    if (Date.now() + COMMIT_POLL_INTERVAL_MS >= deadline) break;
    await page.waitForTimeout(COMMIT_POLL_INTERVAL_MS);
  }
  return { pass: false, observed: `${observed} after ${COMMIT_POLL_TIMEOUT_MS / 1000} s`, seconds: seconds() };
}

/** The "about commit" step: the wait result plus one confirming load in the checked context. */
async function aboutStep(page, origin, commit, wait) {
  const url = new URL('/about', `${origin}/`).href;
  const expected = `build commit ${commit} or a prefix of it with at least ${MIN_COMMIT_PREFIX} characters (within ${COMMIT_POLL_TIMEOUT_MS / 1000} s)`;
  if (!wait.pass) return { step: 'about commit', url, expected, observed: wait.observed, pass: false };
  try {
    const { shown, observed } = await readAboutCommit(page, url, UI_STEP_TIMEOUT_MS);
    const pass = commitMatches(shown, commit);
    return {
      step: 'about commit',
      url,
      expected,
      observed: pass
        ? `${observed} (served after ${wait.seconds} s; confirmed in a fresh profile)`
        : `${wait.observed} after ${wait.seconds} s, then ${observed} in a fresh profile`,
      pass
    };
  } catch (error) {
    return { step: 'about commit', url, expected, observed: `About page error in a fresh profile: ${message(error)}`, pass: false };
  }
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

/**
 * Step 1: waits in its own Chromium context until /about shows the expected commit.
 * Request origins are recorded into `requested`; response headers are not checked here.
 */
async function waitForDeployment(browser, origin, commit, requested) {
  const url = new URL('/about', `${origin}/`).href;
  const context = await browser.newContext();
  try {
    context.on('request', (request) => requested.push(request.url()));
    return await waitForCommit(await context.newPage(), url, commit);
  } catch (error) {
    return { pass: false, observed: `About page error: ${message(error)}`, seconds: '0.0' };
  } finally {
    await context.close().catch(() => {});
  }
}

/** Step 3: the checked browser session in a fresh context. */
async function browserSteps(browser, origin, commit, wait, requested) {
  const results = [];
  const headerFailures = [];
  const pendingHeaders = [];
  let checkedResponses = 0;
  try {
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

    results.push(await aboutStep(page, origin, commit, wait));
    const { result, reviewHref } = await playStep(page, origin);
    results.push(result);
    if (reviewHref) results.push(await reviewHistoryStep(page, origin, reviewHref));
    else results.push({ step: 'review matches history', url: origin, expected: 'a completed hand to review', observed: 'skipped: no hand completed', pass: false });

    await Promise.allSettled(pendingHeaders);
    await context.close();
  } catch (error) {
    results.push({ step: 'browser', url: origin, expected: 'Chromium runs the browser steps', observed: message(error), pass: false });
  }

  results.push(...originAndHeaderResults(origin, requested, headerFailures, checkedResponses));
  return results;
}

/** The two whole-run browser results: request origins (Req 12.3) and response headers (Req 12.5). */
function originAndHeaderResults(origin, requested, headerFailures, checkedResponses) {
  const results = [];
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

  const requested = [];
  let browser;
  try {
    const { chromium } = await import('@playwright/test');
    browser = await chromium.launch();
  } catch (error) {
    report({ step: 'browser', url: origin, expected: 'Chromium runs the browser steps', observed: message(error), pass: false });
  }
  try {
    // Step 1: wait until the edge serves the expected build (no checks recorded yet).
    const wait = browser
      ? await waitForDeployment(browser, origin, commit, requested)
      : { pass: false, observed: 'Chromium unavailable', seconds: '0.0' };
    console.log(`smoke:live: ${wait.pass ? `expected build served after ${wait.seconds} s` : `expected build not confirmed (${wait.observed})`}`);
    // Step 2: strict, single direct requests.
    for (const pathname of SMOKE_PATHS) report(await fetchStep(origin, pathname));
    // Step 3: strict browser session.
    const browserResults = browser
      ? await browserSteps(browser, origin, commit, wait, requested)
      : originAndHeaderResults(origin, requested, [], 0);
    for (const result of browserResults) report(result);
  } finally {
    await browser?.close().catch(() => {});
  }

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
