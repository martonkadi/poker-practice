#!/usr/bin/env node
// Live smoke check for a deployed site.
//
// 1. Waits for the deployment to be served stably, for at most 90 s. Right after
//    `wrangler deploy` returns, Cloudflare's edge can still answer with a bare 404 that is
//    not the app (first deploy of 9d15c68) or serve the old and the new version side by
//    side (deploy of d4f22b9: one /about load showed the new commit, the next one the old
//    one). A probe loads /about in a new Chromium context and fetches `/` plus its entry
//    script directly; it matches only if /about shows --commit AND the entry script embeds
//    it. The wait ends after STABLE_PROBES consecutive matching probes at least
//    PROBE_INTERVAL_MS apart; any mismatch resets the streak. Responses seen while waiting
//    are not header-checked; request origins are still recorded.
// 2. Fetches each SMOKE_PATHS entry directly, once, with a 10 s timeout: HTTP 200, HTML, a
//    same-origin entry module script, the site CSP, nosniff and no-referrer. Then
//    fetches that entry script once (10 s timeout): HTTP 200, JavaScript MIME type,
//    nosniff, no-referrer, and the expected build commit embedded in it, so a shell from
//    an older deployment fails the step.
// 3. In a fresh Chromium context (no saved app data), records every request and response:
//    - fails on any request to a foreign origin;
//    - fails on any same-origin response without nosniff/no-referrer, or an HTML
//      response without the CSP;
//    - loads /about once and confirms the build commit again;
//    - plays one hand with check/call within 120 s, opens its review and confirms the
//      first History row is that hand with the same result.
//    If step 1 did not confirm the expected build, these steps fail without playing:
//    a hand played against an unconfirmed build says nothing about the Candidate.
// 4. Prints one PASS/FAIL line per step with URL, expected and observed values and exits
//    0 only if every step passed.
//
// Usage: pnpm smoke:live --url https://poker-practice.marton-kadi.workers.dev --commit <sha>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  COMMIT_POLL_TIMEOUT_MS,
  FETCH_TIMEOUT_MS,
  HAND_TIMEOUT_MS,
  MIN_COMMIT_PREFIX,
  PROBE_INTERVAL_MS,
  SMOKE_PATHS,
  STABLE_PROBES,
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
  parseReviewResult,
  scriptProblems
} from './smoke-live-lib.mjs';

const UI_STEP_TIMEOUT_MS = 30_000;
/** Upper bound for one /about load while waiting, so a broken mixed-version page cannot eat the wait. */
const PROBE_UI_TIMEOUT_MS = 10_000;
const STABILITY = `${STABLE_PROBES} consecutive probes at least ${PROBE_INTERVAL_MS / 1000} s apart`;

const message = (error) => (error instanceof Error ? error.message.split('\n')[0] : String(error));
const timedOut = (error) => error?.name === 'TimeoutError' || error?.name === 'AbortError';
const requestError = (error) => (timedOut(error)
  ? `no response within ${FETCH_TIMEOUT_MS / 1000} s`
  : `request failed: ${message(error?.cause ?? error)}`);
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** One GET with a 10 s timeout, shortened to end by `deadline` (epoch ms) if one is given. */
const fetchOnce = (url, deadline = Infinity) => fetch(url, {
  redirect: 'manual',
  cache: 'no-store',
  signal: AbortSignal.timeout(Math.max(1, Math.min(FETCH_TIMEOUT_MS, deadline - Date.now())))
});

/**
 * Fetches one path directly, then the entry module script its HTML loads.
 * @returns {Promise<{ status: number, contentType: string, entry: string | null,
 *   script: { status: number, contentType: string } | null, buildCommit: string | null,
 *   problems: string[] }>} `buildCommit` is set only when the entry script embeds `commit`
 */
async function fetchShell(origin, pathname, commit, deadline = Infinity) {
  const response = await fetchOnce(new URL(pathname, `${origin}/`).href, deadline);
  const body = await response.text();
  const headers = normalizeHeaders(response.headers);
  const problems = pageProblems({ status: response.status, headers, body, siteOrigin: origin });
  const entry = entryScript(body, origin);
  const shell = { status: response.status, contentType: headers['content-type'] ?? '', entry, script: null, buildCommit: null, problems };
  if (!entry) return shell;
  try {
    const scriptResponse = await fetchOnce(new URL(entry, `${origin}/`).href, deadline);
    const scriptBody = await scriptResponse.text();
    const scriptHeaders = normalizeHeaders(scriptResponse.headers);
    const script = scriptProblems({ status: scriptResponse.status, headers: scriptHeaders, body: scriptBody, commit });
    shell.script = { status: scriptResponse.status, contentType: scriptHeaders['content-type'] ?? '' };
    shell.buildCommit = script.commit;
    problems.push(...script.problems.map((problem) => `entry ${entry}: ${problem}`));
  } catch (error) {
    problems.push(`entry ${entry}: ${requestError(error)}`);
  }
  return shell;
}

const fetchExpected = (commit) => '200 text/html with a same-origin entry module script, the site CSP, nosniff, no-referrer;'
  + ` the entry script answers 200 JavaScript with nosniff and no-referrer and embeds build commit ${commit}`;

/** Step 2: direct requests without in-app navigation, plus the entry script they load. */
async function fetchStep(origin, pathname, commit) {
  const url = new URL(pathname, `${origin}/`).href;
  const step = `fetch ${pathname}`;
  const expected = fetchExpected(commit);
  try {
    const shell = await fetchShell(origin, pathname, commit);
    const pass = shell.problems.length === 0;
    const observed = pass
      ? `${shell.status} ${shell.contentType}, entry ${shell.entry} (${shell.script.status} ${shell.script.contentType}, build commit ${shell.buildCommit}), headers ok`
      : shell.problems.join('; ');
    return { step, url, expected, observed, pass };
  } catch (error) {
    return { step, url, expected, observed: requestError(error), pass: false };
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
 * One wait probe: /about in a new browser context, plus `/` and its entry script fetched
 * directly. Matches only if both show the expected commit.
 * @returns {Promise<{ ok: boolean, observed: string }>}
 */
async function probeOnce(browser, origin, commit, requested, deadline) {
  const aboutUrl = new URL('/about', `${origin}/`).href;
  let about = { ok: false, observed: 'About page not loaded' };
  const context = await browser.newContext();
  try {
    context.on('request', (request) => requested.push(request.url()));
    const { shown, observed } = await readAboutCommit(await context.newPage(), aboutUrl, Math.min(PROBE_UI_TIMEOUT_MS, deadline - Date.now()));
    about = { ok: commitMatches(shown, commit), observed: `/about ${observed}` };
  } catch (error) {
    about = { ok: false, observed: `/about error: ${message(error)}` };
  } finally {
    await context.close().catch(() => {});
  }
  let shell;
  try {
    const result = await fetchShell(origin, '/', commit, deadline);
    const ok = result.status === 200 && result.buildCommit !== null;
    const commitProblem = result.problems.find((problem) => problem.startsWith('entry ')) ?? `HTTP ${result.status}, entry ${result.entry ?? 'missing'}`;
    shell = { ok, observed: ok ? `/ entry ${result.entry} build commit ${result.buildCommit}` : `/ ${commitProblem}` };
  } catch (error) {
    shell = { ok: false, observed: `/ ${requestError(error)}` };
  }
  return { ok: about.ok && shell.ok, observed: `${about.observed}; ${shell.observed}` };
}

/**
 * Step 1: probes until the expected build is served on STABLE_PROBES consecutive probes, at
 * most COMMIT_POLL_TIMEOUT_MS in total. Any mismatch resets the streak.
 * @returns {Promise<{ pass: boolean, observed: string, seconds: string, probes: number, mismatched: number }>}
 */
async function waitForDeployment(browser, origin, commit, requested) {
  const started = Date.now();
  const deadline = started + COMMIT_POLL_TIMEOUT_MS;
  const seconds = () => ((Date.now() - started) / 1000).toFixed(1);
  let streak = 0;
  let probes = 0;
  let mismatched = 0;
  let lastMismatch = null;
  let observed = 'no probe ran';
  while (Date.now() < deadline) {
    const probe = await probeOnce(browser, origin, commit, requested, deadline);
    probes += 1;
    observed = probe.observed;
    if (probe.ok) {
      streak += 1;
    } else {
      streak = 0;
      mismatched += 1;
      lastMismatch = probe.observed;
    }
    if (streak >= STABLE_PROBES) return { pass: true, observed, seconds: seconds(), probes, mismatched };
    if (Date.now() + PROBE_INTERVAL_MS >= deadline) break;
    await sleep(PROBE_INTERVAL_MS);
  }
  const last = lastMismatch && lastMismatch !== observed ? `last probe: ${observed}; last mismatch: ${lastMismatch}` : `last probe: ${observed}`;
  return {
    pass: false,
    observed: `${last}; streak ${streak} of ${STABLE_PROBES}, ${mismatched} of ${probes} probes mismatched within ${COMMIT_POLL_TIMEOUT_MS / 1000} s`,
    seconds: seconds(),
    probes,
    mismatched
  };
}

/** The "about commit" step: the wait result plus one confirming load in the checked context. */
async function aboutStep(page, origin, commit, wait) {
  const url = new URL('/about', `${origin}/`).href;
  const expected = `build commit ${commit} or a prefix of it with at least ${MIN_COMMIT_PREFIX} characters, served on ${STABILITY} (within ${COMMIT_POLL_TIMEOUT_MS / 1000} s)`;
  if (!wait.pass) return { step: 'about commit', url, expected, observed: wait.observed, pass: false };
  try {
    const { shown, observed } = await readAboutCommit(page, url, UI_STEP_TIMEOUT_MS);
    const pass = commitMatches(shown, commit);
    return {
      step: 'about commit',
      url,
      expected,
      observed: pass
        ? `${observed} (stable on ${STABLE_PROBES} consecutive probes after ${wait.seconds} s; confirmed in a fresh profile)`
        : `${wait.observed} stable after ${wait.seconds} s, then ${observed} in a fresh profile`,
      pass
    };
  } catch (error) {
    return { step: 'about commit', url, expected, observed: `About page error in a fresh profile: ${message(error)}`, pass: false };
  }
}

/** Plays one hand with check/call until it completes. */
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

/** Opens the hand's review, reads its result and compares the first History row. */
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
    if (wait.pass) {
      const { result, reviewHref } = await playStep(page, origin);
      results.push(result);
      if (reviewHref) results.push(await reviewHistoryStep(page, origin, reviewHref));
      else results.push({ step: 'review matches history', url: origin, expected: 'a completed hand to review', observed: 'skipped: no hand completed', pass: false });
    } else {
      // A hand played against an unconfirmed build says nothing about the Candidate.
      const skipped = `skipped: build commit ${commit} was not served on ${STABILITY}`;
      results.push({ step: 'play hand', url: new URL('/', `${origin}/`).href, expected: `one hand completes (showdown or fold) within ${HAND_TIMEOUT_MS / 1000} s`, observed: skipped, pass: false });
      results.push({ step: 'review matches history', url: origin, expected: 'a completed hand to review', observed: skipped, pass: false });
    }

    await Promise.allSettled(pendingHeaders);
    await context.close();
  } catch (error) {
    results.push({ step: 'browser', url: origin, expected: 'Chromium runs the browser steps', observed: message(error), pass: false });
  }

  results.push(...originAndHeaderResults(origin, requested, headerFailures, checkedResponses));
  return results;
}

/** The two whole-run browser results: request origins and response headers. */
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
    expected: 'every response has nosniff and no-referrer; HTML responses have the site CSP',
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
    // Step 1: wait until the edge serves the expected build stably (no checks recorded yet).
    const wait = browser
      ? await waitForDeployment(browser, origin, commit, requested)
      : { pass: false, observed: 'Chromium unavailable', seconds: '0.0', probes: 0, mismatched: 0 };
    console.log(`smoke:live: ${wait.pass
      ? `expected build served after ${wait.seconds} s: stable on ${STABILITY} (${wait.mismatched} of ${wait.probes} probes mismatched)`
      : `expected build not confirmed (${wait.observed})`}`);
    // Step 2: strict, single direct requests.
    for (const pathname of SMOKE_PATHS) report(await fetchStep(origin, pathname, commit));
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
