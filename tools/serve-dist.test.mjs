// Run with: node --test tools/serve-dist.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createDistServer, headersFor, mimeTypeFor, parseArgs, parseHeadersFile } from './serve-dist.mjs';

const plain = (map) => Object.fromEntries([...map.values()].map(({ name, value }) => [name, value]));

test('parses rules and applies splat, placeholder, merge and detach', () => {
  const rules = parseHeadersFile([
    '# comment',
    '/*',
    '  X-A: one',
    '  X-Gone: yes',
    '/assets/*',
    '  X-A: two',
    '  ! X-Gone',
    '/review/:id',
    '  X-Review: 1'
  ].join('\n'));
  assert.equal(rules.length, 3);
  assert.deepEqual(plain(headersFor(rules, '/')), { 'X-A': 'one', 'X-Gone': 'yes' });
  assert.deepEqual(plain(headersFor(rules, '/assets/app.js')), { 'X-A': 'one, two' });
  assert.deepEqual(plain(headersFor(rules, '/review/abc')), { 'X-A': 'one', 'X-Gone': 'yes', 'X-Review': '1' });
  assert.equal(headersFor(rules, '/review/abc/more').has('x-review'), false);
});

test('rejects malformed _headers lines', () => {
  assert.throws(() => parseHeadersFile('  X-A: one'), /before any URL pattern/);
  assert.throws(() => parseHeadersFile('/*\n  no-colon'), /expected "Name: value"/);
});

test('uses the fixed MIME map', () => {
  assert.equal(mimeTypeFor('a/b.js'), 'text/javascript; charset=utf-8');
  assert.equal(mimeTypeFor('x.CSS'), 'text/css; charset=utf-8');
  assert.equal(mimeTypeFor('license.txt'), 'text/plain; charset=utf-8');
  assert.equal(mimeTypeFor('file.unknown'), 'application/octet-stream');
});

test('serves files, SPA fallback, headers and blocks traversal', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'serve-dist-'));
  const root = path.join(base, 'dist');
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>app</title>');
  await writeFile(path.join(root, 'assets', 'app.js'), 'export {};');
  await writeFile(path.join(root, '_headers'), '/*\n  X-Test: on\n');
  await writeFile(path.join(base, 'secret.txt'), 'secret');
  const server = createDistServer({ root, rules: parseHeadersFile('/*\n  X-Test: on\n') });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(base, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`;

  const js = await fetch(`${origin}/assets/app.js`);
  assert.equal(js.status, 200);
  assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(js.headers.get('x-test'), 'on');

  for (const route of ['/', '/play', '/review/unknown', '/_headers', '/..%2Fsecret.txt', '/..%5Csecret.txt']) {
    const response = await fetch(`${origin}${route}`);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8', route);
    assert.equal(response.headers.get('x-test'), 'on', route);
    assert.equal(await response.text(), '<!doctype html><title>app</title>', route);
  }
});

test('--unrouted-ms answers a bare 404 without _headers values until the window ends', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'serve-dist-'));
  const root = path.join(base, 'dist');
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>app</title>');
  const server = createDistServer({ root, rules: parseHeadersFile('/*\n  X-Test: on\n'), unroutedMs: 400 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(base, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`;

  const early = await fetch(`${origin}/`);
  assert.equal(early.status, 404);
  assert.equal(early.headers.get('x-test'), null);
  assert.doesNotMatch(await early.text(), /<title>app<\/title>/);

  await new Promise((resolve) => setTimeout(resolve, 450));
  const late = await fetch(`${origin}/`);
  assert.equal(late.status, 200);
  assert.equal(late.headers.get('x-test'), 'on');
  assert.equal(await late.text(), '<!doctype html><title>app</title>');
});

test('--stale-dir/--stale-ms serve every second request from the older build, with its own _headers, until the window ends', async (t) => {
  const base = await mkdtemp(path.join(tmpdir(), 'serve-dist-'));
  const root = path.join(base, 'dist');
  const staleRoot = path.join(base, 'stale');
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await mkdir(path.join(staleRoot, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<title>new</title>');
  await writeFile(path.join(root, 'assets', 'index-new.js'), 'new');
  await writeFile(path.join(staleRoot, 'index.html'), '<title>old</title>');
  await writeFile(path.join(staleRoot, 'assets', 'index-old.js'), 'old');
  const server = createDistServer({
    root,
    rules: parseHeadersFile('/*\n  X-Build: new\n'),
    stale: { root: staleRoot, rules: parseHeadersFile('/*\n  X-Build: old\n'), ms: 1_500 }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); await rm(base, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = async (route) => {
    const response = await fetch(`${origin}${route}`);
    return `${response.headers.get('x-build')} ${response.headers.get('content-type').split(';')[0]} ${await response.text()}`;
  };

  // Mixed window: requests alternate; each build answers the other's entry path with its own HTML fallback.
  assert.deepEqual([await get('/'), await get('/'), await get('/assets/index-old.js'), await get('/assets/index-new.js')], [
    'new text/html <title>new</title>',
    'old text/html <title>old</title>',
    'new text/html <title>new</title>',
    'old text/html <title>old</title>'
  ]);

  await new Promise((resolve) => setTimeout(resolve, 1_600));
  assert.deepEqual([await get('/'), await get('/'), await get('/assets/index-new.js'), await get('/assets/index-old.js')], [
    'new text/html <title>new</title>',
    'new text/html <title>new</title>',
    'new text/javascript new',
    'new text/html <title>new</title>'
  ]);
});

test('parseArgs requires --stale-dir and a positive --stale-ms together', () => {
  assert.equal(parseArgs([]).staleDir, null);
  const options = parseArgs(['--stale-dir', 'old-dist', '--stale-ms', '5000']);
  assert.equal(options.staleDir, path.resolve('old-dist'));
  assert.equal(options.staleMs, 5000);
  assert.throws(() => parseArgs(['--stale-dir', 'old-dist']), /must be given together/);
  assert.throws(() => parseArgs(['--stale-ms', '5000']), /must be given together/);
  assert.throws(() => parseArgs(['--stale-dir', 'old-dist', '--stale-ms', '-1']), /Invalid --stale-ms/);
});
