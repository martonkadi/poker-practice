// Release browser checks for static hosting headers and the CSP (Req 8.1–8.3, 8.5–8.7).
//
// The suite runs against `tools/serve-dist.mjs`, which applies `dist/_headers`
// exactly as parsed, so these tests verify the deployment artifact's header
// file. Asset URLs are discovered from the served HTML and bundle, never
// hard-coded, so content hashes may change freely.
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { test, expect, type Page } from './fixtures';
import { handRecordSchema } from '../../packages/contracts/src/index';

const HTML_ROUTES = ['/', '/play', '/history', '/settings', '/about', '/review/00000000-0000-4000-8000-000000000000', '/no-such-page-e2e'];
const REQUIRED_DIRECTIVES: Record<string, string> = {
  'default-src': "'self'",
  'script-src': "'self'",
  'style-src': "'self'",
  'worker-src': "'self'",
  'connect-src': "'self'",
  'object-src': "'none'",
  'base-uri': "'self'"
};
/** Only these source expressions may appear anywhere in the policy (Req 8.2: no other origin, no wildcard). */
const ALLOWED_SOURCES = new Set(["'self'", "'none'"]);
const FORBIDDEN_TOKENS = ["'unsafe-inline'", "'unsafe-eval'", 'blob:', 'data:', '*'];

/** Parses a CSP header into directive name -> source list. */
function parseCsp(value: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const part of value.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
    if (name) directives.set(name.toLowerCase(), sources);
  }
  return directives;
}

/** Every problem with a CSP value, each naming the header and URL (Req 8.7). */
function cspProblems(value: string | undefined, url: string): string[] {
  if (!value) return [`Content-Security-Policy header missing on ${url}`];
  const problems: string[] = [];
  const directives = parseCsp(value);
  for (const [name, source] of Object.entries(REQUIRED_DIRECTIVES)) {
    const sources = directives.get(name);
    if (!sources) problems.push(`Content-Security-Policy on ${url} lacks directive "${name} ${source}"`);
    else if (sources.join(' ') !== source) problems.push(`Content-Security-Policy on ${url} has "${name} ${sources.join(' ')}", expected "${name} ${source}"`);
  }
  for (const [name, sources] of directives) {
    for (const source of sources) {
      const lower = source.toLowerCase();
      if (FORBIDDEN_TOKENS.some(token => lower === token || (token === '*' && lower.includes('*')))) {
        problems.push(`Content-Security-Policy on ${url} contains forbidden source "${source}" in "${name}"`);
      } else if (!ALLOWED_SOURCES.has(lower)) {
        problems.push(`Content-Security-Policy on ${url} allows source other than 'self' ("${source}" in "${name}")`);
      }
    }
  }
  return problems;
}

/** Problems with the headers every response must carry (Req 8.3). */
function commonHeaderProblems(headers: Record<string, string>, url: string): string[] {
  const problems: string[] = [];
  const nosniff = headers['x-content-type-options'];
  if (nosniff?.trim().toLowerCase() !== 'nosniff') problems.push(`X-Content-Type-Options on ${url}: expected "nosniff", got ${JSON.stringify(nosniff ?? null)}`);
  const referrer = headers['referrer-policy'];
  if (referrer?.trim().toLowerCase() !== 'no-referrer') problems.push(`Referrer-Policy on ${url}: expected "no-referrer", got ${JSON.stringify(referrer ?? null)}`);
  return problems;
}

function mimeProblem(headers: Record<string, string>, url: string, expected: RegExp, label: string): string[] {
  const type = headers['content-type'] ?? '';
  const essence = type.split(';')[0]!.trim().toLowerCase();
  return expected.test(essence) ? [] : [`Content-Type on ${url}: expected ${label}, got ${JSON.stringify(type || null)}`];
}

const JAVASCRIPT = /^(text|application)\/(javascript|ecmascript|x-javascript)$/;

async function fetchOk(request: APIRequestContext, url: string): Promise<APIResponse> {
  const response = await request.get(url, { maxRedirects: 0 });
  expect(response.status(), `HTTP status for ${url}`).toBe(200);
  return response;
}

/** Entry script, stylesheets and the bot worker URL, discovered from the served build. */
async function discoverAssets(request: APIRequestContext): Promise<{ entry: string; css: string[]; scripts: string[]; worker: string }> {
  const html = await (await fetchOk(request, '/')).text();
  const entry = /<script\b[^>]*type="module"[^>]*\bsrc="([^"]+)"/.exec(html)?.[1];
  expect(entry, 'index.html entry module script tag').toBeTruthy();
  const css = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m => m[1]!);
  expect(css.length, 'index.html stylesheet links').toBeGreaterThan(0);
  // Walk the JS chunk graph from the entry so the worker is found even when it
  // is referenced from a lazily loaded chunk.
  const scripts: string[] = [];
  const queue = [new URL(entry!, 'http://x/').pathname];
  let worker: string | undefined;
  while (queue.length) {
    const script = queue.shift()!;
    if (scripts.includes(script)) continue;
    scripts.push(script);
    const source = await (await fetchOk(request, script)).text();
    const base = new URL(script, 'http://x/');
    for (const match of source.matchAll(/["'`]((?:\/|\.\/|\.\.\/)?(?:assets\/)?[\w.-]+\.js)["'`]/g)) {
      const resolved = new URL(match[1]!, base).pathname;
      if (!resolved.startsWith('/assets/')) continue;
      if (/bot\.worker/.test(resolved)) {
        worker = resolved;
        // The worker must be constructed as a module worker (Req 8.6).
        expect(source, `module worker construction for ${resolved} in ${script}`).toMatch(/new Worker\([^)]*bot\.worker[^]*?\{\s*type:\s*["'`]module["'`]\s*\}/);
      } else queue.push(resolved);
    }
  }
  expect(worker, 'bot worker script URL referenced from the bundle').toBeTruthy();
  return { entry: new URL(entry!, 'http://x/').pathname, css: css.map(href => new URL(href, 'http://x/').pathname), scripts, worker: worker! };
}

test('every response carries the security headers and a correct MIME type', async ({ request }) => {
  const problems: string[] = [];
  for (const route of HTML_ROUTES) {
    const response = await fetchOk(request, route);
    const headers = response.headers();
    problems.push(...cspProblems(headers['content-security-policy'], route));
    problems.push(...commonHeaderProblems(headers, route));
    problems.push(...mimeProblem(headers, route, /^text\/html$/, 'text/html'));
    const body = await response.text();
    if (!/<script\b[^>]*type="module"[^>]*\bsrc="\/assets\/[^"]+\.js"/.test(body)) problems.push(`HTML on ${route} does not load the Web_App entry script`);
  }
  const assets = await discoverAssets(request);
  expect(assets.scripts).toContain(assets.entry);
  for (const script of [...assets.scripts, assets.worker]) {
    const headers = (await fetchOk(request, script)).headers();
    problems.push(...commonHeaderProblems(headers, script));
    problems.push(...mimeProblem(headers, script, JAVASCRIPT, 'a JavaScript MIME type'));
  }
  for (const stylesheet of assets.css) {
    const headers = (await fetchOk(request, stylesheet)).headers();
    problems.push(...commonHeaderProblems(headers, stylesheet));
    problems.push(...mimeProblem(headers, stylesheet, /^text\/css$/, 'text/css'));
  }
  // Plain-text files: CSP is detached in _headers (Req 8.1 covers HTML only), but
  // nosniff, no-referrer and text/plain are still required (Req 8.3, 8.5).
  for (const text of ['/license.txt', '/third-party-notices.txt']) {
    const response = await fetchOk(request, text);
    problems.push(...commonHeaderProblems(response.headers(), text));
    problems.push(...mimeProblem(response.headers(), text, /^text\/plain$/, 'text/plain'));
    if (text === '/license.txt') expect(await response.text()).toContain('MIT License');
  }
  expect(problems, problems.join('\n')).toEqual([]);
});

async function playPassively(page: Page): Promise<void> {
  const complete = page.getByRole('heading', { name: 'Hand complete', exact: true });
  const heroReady = page.locator('button:enabled', { hasText: /^(Call|Check)/ });
  for (let i = 0; i < 50; i++) {
    await expect(complete.or(heroReady).first()).toBeVisible({ timeout: 15_000 });
    if (await complete.isVisible()) return;
    await page.getByRole('button', { name: /^(Call|Check)/ }).click();
  }
  throw new Error('Hand did not finish');
}

test('real module worker plays a hand, review, export and license with zero CSP violations', async ({ page, securityViolations }) => {
  test.slow();
  const origin = new URL(test.info().project.use.baseURL!).origin;
  const workers: string[] = [];
  page.on('worker', worker => workers.push(worker.url()));
  const responseProblems: string[] = [];
  const foreign: string[] = [];
  page.on('response', response => {
    const url = response.url();
    if (!/^https?:/.test(url)) return;
    if (new URL(url).origin !== origin) { foreign.push(url); return; }
    responseProblems.push(...commonHeaderProblems(response.headers(), url));
  });

  await page.goto('/play');
  await page.getByRole('button', { name: 'Deal the first hand' }).click();
  await playPassively(page);
  // Passive play guarantees the bot acted at least once (it either responds to a call/check or acts first).
  await expect(page.locator('ol li', { hasText: /^Bot ·/ }).first()).toBeVisible();
  await expect.poll(() => workers.length, 'a dedicated worker was started').toBeGreaterThan(0);
  for (const url of workers) {
    expect(new URL(url).origin, `worker script ${url} is same-origin`).toBe(origin);
    expect(new URL(url).pathname, `worker script ${url} is the bundled bot worker`).toMatch(/^\/assets\/bot\.worker[\w.-]*\.js$/);
  }

  await page.getByRole('link', { name: 'Review hand' }).click();
  await expect(page.getByRole('heading', { name: /^Decision 1 of \d+$/ })).toBeVisible();

  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const archive = JSON.parse(Buffer.concat(chunks).toString());
  expect(archive.format).toBe('poker-practice');
  expect(archive.schemaVersion).toBe(1);
  expect(archive.hands).toHaveLength(1);
  expect(handRecordSchema.safeParse(archive.hands[0]).success).toBe(true);

  await page.getByRole('link', { name: 'About', exact: true }).click();
  await page.getByRole('link', { name: 'First-party license' }).click();
  await expect(page).toHaveURL(/\/license\.txt$/);
  await expect(page.locator('body')).toContainText('MIT License');

  expect(foreign, 'requests to other origins').toEqual([]);
  expect(responseProblems, responseProblems.join('\n')).toEqual([]);
  // The auto fixture also fails the test on teardown; asserting here gives a clearer location.
  expect(securityViolations, securityViolations.map(v => v.blockedURI ?? v.text).join('\n')).toEqual([]);
});
