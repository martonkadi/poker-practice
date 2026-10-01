// Run with: node --test tools/smoke-live-lib.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  commitMatches,
  entryScript,
  exitCode,
  foreignOrigins,
  formatResult,
  headerProblems,
  pageProblems,
  parseArgs,
  parseBuildCommit,
  parseReviewResult
} from './smoke-live-lib.mjs';

const SITE = 'https://poker.example';
const SHA = '0123456789abcdef0123456789abcdef01234567';
const GOOD_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
const BASE_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const HTML_HEADERS = { ...BASE_HEADERS, 'Content-Security-Policy': GOOD_CSP, 'Content-Type': 'text/html; charset=utf-8' };
const GOOD_HTML = '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-abc.js"></script></head><body><div id="root"></div></body></html>';

// Header validation (Req 12.5)

test('accepts the required headers in any case, from a plain object or a Headers instance', () => {
  assert.deepEqual(headerProblems(HTML_HEADERS, { html: true }), []);
  assert.deepEqual(headerProblems(new Headers(HTML_HEADERS), { html: true }), []);
  assert.deepEqual(headerProblems({ 'x-content-type-options': ' nosniff ', 'referrer-policy': 'no-referrer' }, { html: false }), []);
});

test('reports missing and different nosniff / no-referrer values on any response', () => {
  assert.deepEqual(headerProblems({ 'Referrer-Policy': 'no-referrer' }, { html: false }), [
    'missing X-Content-Type-Options (expected "nosniff")'
  ]);
  assert.deepEqual(headerProblems({ ...BASE_HEADERS, 'Referrer-Policy': 'origin' }, { html: false }), [
    'Referrer-Policy is "origin", expected "no-referrer"'
  ]);
});

test('requires the Requirement 8 CSP only on HTML responses', () => {
  assert.deepEqual(headerProblems(BASE_HEADERS, { html: false }), []);
  assert.deepEqual(headerProblems(BASE_HEADERS, { html: true }), ['missing Content-Security-Policy']);
  const weak = headerProblems({ ...HTML_HEADERS, 'Content-Security-Policy': GOOD_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'") }, { html: true });
  assert.ok(weak.some((p) => /script-src.*forbidden token 'unsafe-inline'/.test(p)), weak.join('; '));
});

test('pageProblems passes a good page and names each failure of a bad one', () => {
  assert.deepEqual(pageProblems({ status: 200, headers: HTML_HEADERS, body: GOOD_HTML, siteOrigin: SITE }), []);
  const problems = pageProblems({
    status: 404,
    headers: { ...BASE_HEADERS, 'Content-Type': 'text/plain' },
    body: '<script type="module" src="https://cdn.example/app.js"></script>',
    siteOrigin: SITE
  });
  assert.deepEqual(problems, [
    'status 404, expected 200',
    'content-type "text/plain", expected text/html',
    'no same-origin <script type="module" src> entry script',
    'missing Content-Security-Policy'
  ]);
});

test('entryScript returns the first same-origin module script path', () => {
  const html = '<script type="module" src="https://cdn.example/x.js"></script><script type="module" src="/assets/index-abc.js"></script>';
  assert.equal(entryScript(html, SITE), '/assets/index-abc.js');
  assert.equal(entryScript(`<script type="module" src="${SITE}/assets/a.js"></script>`, SITE), '/assets/a.js');
  assert.equal(entryScript('<script src="/assets/classic.js"></script>', SITE), null);
});

// Foreign-origin detection (Req 12.3)

test('foreignOrigins ignores same-origin, data: and about: URLs', () => {
  assert.deepEqual(foreignOrigins([
    `${SITE}/`,
    `${SITE}/assets/index-abc.js?v=1`,
    'data:image/png;base64,AAAA',
    'about:blank'
  ], SITE), []);
});

test('foreignOrigins reports each foreign origin once, sorted, including other ports and schemes', () => {
  assert.deepEqual(foreignOrigins([
    'https://fonts.example/a.woff2',
    'https://api.example/v1',
    'https://fonts.example/b.woff2',
    'http://poker.example/',
    'https://poker.example:8443/'
  ], `${SITE}/play`), [
    'http://poker.example',
    'https://api.example',
    'https://fonts.example',
    'https://poker.example:8443'
  ]);
});

test('foreignOrigins attributes blob: URLs to their creator and reports unparseable URLs', () => {
  assert.deepEqual(foreignOrigins([`blob:${SITE}/1234-abcd`], SITE), []);
  assert.deepEqual(foreignOrigins(['blob:https://evil.example/1234', 'not a url'], SITE), [
    'https://evil.example',
    'unparseable URL not a url'
  ]);
});

// Commit prefix matching (Req 12.4)

test('commitMatches accepts the full SHA or a prefix of at least 7 characters, ignoring case and spaces', () => {
  assert.equal(commitMatches(SHA, SHA), true);
  assert.equal(commitMatches(SHA.slice(0, 7), SHA), true);
  assert.equal(commitMatches(` ${SHA.slice(0, 12).toUpperCase()} `, SHA), true);
  assert.equal(commitMatches(SHA.slice(0, 7), SHA.slice(0, 7)), true);
});

test('commitMatches rejects short prefixes, mismatches, non-prefixes and missing values', () => {
  assert.equal(commitMatches(SHA.slice(0, 6), SHA), false);
  assert.equal(commitMatches('fedcba9', SHA), false);
  assert.equal(commitMatches(SHA.slice(1, 9), SHA), false);
  assert.equal(commitMatches(`${SHA}0`, SHA), false);
  assert.equal(commitMatches('', SHA), false);
  assert.equal(commitMatches(null, SHA), false);
  assert.equal(commitMatches('unknown', SHA), false);
});

test('parseBuildCommit and parseReviewResult read the displayed values', () => {
  assert.equal(parseBuildCommit('Version 0.1.0-rc.1 · Build commit: 0123456 · production'), '0123456');
  assert.equal(parseBuildCommit(`Build commit: ${SHA}`), SHA);
  assert.equal(parseBuildCommit('Build commit: · production'), null);
  assert.equal(parseBuildCommit('No commit here'), null);
  assert.equal(parseReviewResult('Final board: Ah Kd 2c · Result: +100 chips · Showdown'), '+100 chips');
  assert.equal(parseReviewResult('Final board: Ah Kd 2c'), null);
});

// Non-zero exit and failure reporting (Req 12.6, 12.7)

test('exitCode is 0 only when at least one step ran and every step passed', () => {
  assert.equal(exitCode([{ pass: true }, { pass: true }]), 0);
  assert.equal(exitCode([{ pass: true }, { pass: false }]), 1);
  assert.equal(exitCode([{ pass: true }, {}]), 1);
  assert.equal(exitCode([]), 1);
  assert.equal(exitCode(undefined), 1);
});

test('formatResult reports the step, URL, expected and observed values on one line', () => {
  const line = formatResult({ step: 'about commit', url: `${SITE}/about`, expected: 'build commit 0123456', observed: 'build commit\n  fedcba9', pass: false });
  assert.equal(line, `FAIL about commit | url: ${SITE}/about | expected: build commit 0123456 | observed: build commit fedcba9`);
  assert.match(formatResult({ step: 'fetch /', url: `${SITE}/`, expected: 'x', observed: 'x', pass: true }), /^PASS fetch \/ \|/);
});

test('parseArgs requires an http(s) --url and a 7 to 40 hex --commit', () => {
  assert.deepEqual(parseArgs(['--url', `${SITE}/play`, '--commit', SHA]), { origin: SITE, commit: SHA });
  assert.deepEqual(parseArgs(['--', `--url=${SITE}`, '--commit=0123abc']), { origin: SITE, commit: '0123abc' });
  assert.throws(() => parseArgs(['--commit', SHA]), /Missing --url/);
  assert.throws(() => parseArgs(['--url', SITE]), /Missing --commit/);
  assert.throws(() => parseArgs(['--url', 'ftp://poker.example', '--commit', SHA]), /must be http\(s\)/);
  assert.throws(() => parseArgs(['--url', 'not a url', '--commit', SHA]), /Invalid --url/);
  assert.throws(() => parseArgs(['--url', SITE, '--commit', '012345']), /7 to 40 hex/);
  assert.throws(() => parseArgs(['--url', SITE, '--commit', 'zzzzzzz']), /7 to 40 hex/);
  assert.throws(() => parseArgs(['--url', SITE, '--commit', SHA, '--extra']), /Unknown or incomplete argument/);
});

test('the CLI exits non-zero with a usage message on invalid arguments', () => {
  const cli = fileURLToPath(new URL('./smoke-live.mjs', import.meta.url));
  for (const args of [[], ['--url', SITE, '--commit', 'nothex!']]) {
    const run = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /Usage: pnpm smoke:live --url <https:\/\/site> --commit <sha>/);
  }
});
