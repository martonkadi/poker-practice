// Run with: node --test tools/check-dist.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ENTRY_LIMIT_BYTES, checkDist, cspProblems } from './check-dist.mjs';

const GOOD_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; worker-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";
const headersFile = (csp = GOOD_CSP, extra = '') => [
  '/*',
  `  Content-Security-Policy: ${csp}`,
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: no-referrer',
  extra
].join('\n');
const GOOD_HTML = '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-abc.js"></script><link rel="stylesheet" href="/assets/index.css"></head><body><div id="root"></div></body></html>';

/** Creates a minimal valid dist directory, applies overrides, and returns the checkDist result. */
async function run(t, { html = GOOD_HTML, headers = headersFile(), files = {}, entryBytes = 1000 } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'check-dist-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), html);
  await writeFile(path.join(root, 'assets', 'index-abc.js'), 'x'.repeat(entryBytes));
  await writeFile(path.join(root, 'assets', 'index.css'), 'body{}');
  await writeFile(path.join(root, 'license.txt'), 'license');
  if (headers !== null) await writeFile(path.join(root, '_headers'), headers);
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  return checkDist(root);
}
const checks = (result) => [...new Set(result.failures.map((f) => f.check))];

test('a valid build passes and reports the entry size', async (t) => {
  const result = await run(t, { entryBytes: ENTRY_LIMIT_BYTES });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.entry, { file: '/assets/index-abc.js', bytes: ENTRY_LIMIT_BYTES });
});

test('entry chunk over the limit fails with the measured size and limit', async (t) => {
  const result = await run(t, { entryBytes: ENTRY_LIMIT_BYTES + 1 });
  assert.deepEqual(checks(result), ['entry-size']);
  assert.match(result.failures[0].message, /500,001 bytes, over the 500,000-byte limit/);
  assert.equal(result.entry.bytes, ENTRY_LIMIT_BYTES + 1);
});

test('missing entry script fails', async (t) => {
  const result = await run(t, { html: '<!doctype html><div id="root"></div>' });
  assert.deepEqual(checks(result), ['entry-size']);
});

test('supabase (any case) and cloud identifiers in JavaScript fail', async (t) => {
  const result = await run(t, { files: { 'assets/chunk.js': 'const a="SupaBase";x.signInWithOAuth();' } });
  assert.deepEqual(checks(result), ['cloud-code']);
  assert.deepEqual(result.failures.map((f) => f.message), [
    '/assets/chunk.js contains "supabase"',
    '/assets/chunk.js contains "signInWithOAuth"'
  ]);
});

test('test hook markers and test-only files fail', async (t) => {
  const result = await run(t, { files: { 'assets/chunk.js': 'window.__POKER_TEST__={}', 'tests/e2e/x.js': '' } });
  assert.deepEqual(checks(result), ['test-hook']);
  assert.equal(result.failures.length, 2);
});

test('inline script and style in index.html fail', async (t) => {
  const html = GOOD_HTML.replace('</head>', '<script>alert(1)</script><style>body{}</style></head>');
  const result = await run(t, { html });
  assert.deepEqual(checks(result), ['inline-markup']);
  assert.deepEqual(result.failures.map((f) => f.message), ['index.html: inline <script> without src', 'index.html: inline <style> element']);
});

test('missing _headers fails', async (t) => {
  const result = await run(t, { headers: null });
  assert.deepEqual(checks(result), ['headers']);
});

test('missing or different header values fail and name the header', async (t) => {
  const missing = await run(t, { headers: headersFile().replace('  Referrer-Policy: no-referrer\n', '') });
  assert.deepEqual(checks(missing), ['headers']);
  assert.ok(missing.failures.some((f) => /missing header Referrer-Policy/.test(f.message)));
  const different = await run(t, { headers: headersFile().replace('nosniff', 'sniff') });
  assert.ok(different.failures.some((f) => /X-Content-Type-Options is "sniff", expected "nosniff"/.test(f.message)));
  const detached = await run(t, { headers: headersFile(GOOD_CSP, '/assets/*\n  ! Referrer-Policy') });
  assert.ok(detached.failures.some((f) => f.message === '/assets/index-abc.js: missing header Referrer-Policy (expected "no-referrer")'));
  assert.ok(!detached.failures.some((f) => f.message.startsWith('/:')));
});

test('CSP must include required directives and forbids unsafe tokens, wildcards and other origins', () => {
  assert.deepEqual(cspProblems(GOOD_CSP), []);
  assert.ok(cspProblems(GOOD_CSP.replace("base-uri 'self'; ", '')).includes('CSP is missing directive "base-uri \'self\'"'));
  assert.ok(cspProblems(GOOD_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")).some((p) => /script-src.*forbidden token 'unsafe-inline'/.test(p)));
  assert.ok(cspProblems(GOOD_CSP.replace("style-src 'self'", "style-src 'self' 'unsafe-eval'")).some((p) => /forbidden token 'unsafe-eval'/.test(p)));
  assert.ok(cspProblems(GOOD_CSP.replace("worker-src 'self'", "worker-src 'self' blob:")).some((p) => /forbidden token blob:/.test(p)));
  assert.ok(cspProblems(GOOD_CSP.replace("img-src 'self'", "img-src 'self' data:")).some((p) => /forbidden token data:/.test(p)));
  assert.ok(cspProblems(GOOD_CSP.replace("connect-src 'self'", "connect-src 'self' *")).some((p) => /wildcard/.test(p)));
  assert.ok(cspProblems(GOOD_CSP.replace("img-src 'self'", "img-src 'self' https://cdn.example")).some((p) => /https:\/\/cdn\.example other than 'self'/.test(p)));
});

test('forbidden CSP tokens in _headers fail the build check', async (t) => {
  const result = await run(t, { headers: headersFile(GOOD_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")) });
  assert.deepEqual(checks(result), ['headers']);
  assert.ok(result.failures.some((f) => f.message.startsWith('/: ') && /unsafe-eval/.test(f.message)));
});
