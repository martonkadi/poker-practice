// Regression test for the first live deploy of 9d15c68 (2026-10-01). `wrangler deploy`
// had returned, but Cloudflare's edge still answered the smoke check's first direct
// requests with bare 404s (no app shell, no `_headers` values). The smoke check failed
// 8 of 12 steps although the same deployment passed every step minutes later.
//
// This serves the same dist through tools/serve-dist.mjs with `--unrouted-ms`, which
// answers every request with such a 404 for the first seconds, and requires
// `pnpm smoke:live` to wait it out and then pass every step with its strict checks.
// Chromium only: the smoke check drives its own Chromium.
//
// The deploy of d4f22b9 (2026-10-01) showed the second gap: during edge propagation the
// old and the new version answered side by side. One /about load showed the new commit,
// the direct fetches got the old shell (entry chunk of 9d15c68) and still passed, and the
// next /about load showed the old commit. The two "mixed version" tests below build a
// second dist with another VITE_GIT_COMMIT into a temp dir outside the repo and serve it
// for every second request (`--stale-dir`/`--stale-ms`). The smoke check must wait out a
// short mixed window and then pass, and must fail when the old version keeps answering.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';

const PORT = 4183;
const UNROUTED_MS = 8_000;
const MIXED_PORT = 4184;
const PERSISTENT_PORT = 4186;
const MIXED_MS = 10_000;
/** Longer than any smoke run: the old version never stops answering. */
const PERSISTENT_MS = 3_600_000;
const STALE_COMMIT = 'deadbeef'.repeat(5);

/** Collects stdout+stderr; resolves once `pattern` appears, rejects on exit or timeout. */
function waitForOutput(child: ChildProcess, pattern: RegExp, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${pattern}: ${output}`)), timeoutMs);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      if (pattern.test(output)) { clearTimeout(timer); resolve(); }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`exited with ${code} before ${pattern}: ${output}`)); });
  });
}

function runToEnd(child: ChildProcess): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    let output = '';
    child.stdout?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.once('exit', (code) => resolve({ code, output }));
  });
}

test('live smoke waits out a not-yet-routed deployment, then passes every strict step', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'smoke:live drives its own Chromium; one run covers it');
  test.setTimeout(240_000);

  await page.goto('/about');
  const line = await page.getByText(/Build commit:/).first().innerText();
  const commit = /Build commit:\s*([0-9a-f]{7,40})\b/i.exec(line)?.[1];
  test.skip(!commit, 'dist was built without VITE_GIT_COMMIT');

  const root = path.dirname(testInfo.config.configFile ?? path.resolve('playwright.config.ts'));
  const server = spawn(process.execPath, [
    path.join(root, 'tools', 'serve-dist.mjs'), '--host', '127.0.0.1', '--port', String(PORT), '--unrouted-ms', String(UNROUTED_MS)
  ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await waitForOutput(server, /serve-dist: serving/, 30_000);
    const smoke = spawn(process.execPath, [
      path.join(root, 'tools', 'smoke-live.mjs'), '--url', `http://127.0.0.1:${PORT}`, '--commit', commit as string
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    const { code, output } = await runToEnd(smoke);
    expect(output, output).toMatch(/smoke:live: expected build served after \d+\.\d s/);
    expect(output, output).toMatch(/smoke:live: PASS all 12 steps/);
    expect(code, output).toBe(0);
  } finally {
    server.kill();
  }
});

const entryOf = (dir: string) => /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(readFileSync(path.join(dir, 'index.html'), 'utf8'))?.[1];

/** Builds the same sources with another VITE_GIT_COMMIT into a temp dir outside the repo. */
function buildStaleDist(root: string): string {
  const outDir = mkdtempSync(path.join(os.tmpdir(), 'poker-stale-dist-'));
  const run = spawnSync(process.execPath, [
    path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.config.ts', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'
  ], { cwd: root, env: { ...process.env, VITE_GIT_COMMIT: STALE_COMMIT }, encoding: 'utf8', timeout: 120_000 });
  if (run.status !== 0) {
    rmSync(outDir, { recursive: true, force: true });
    throw new Error(`stale build failed (${run.status}): ${run.stderr}${run.stdout}`);
  }
  return outDir;
}

/** Reads the dist's commit from /about and builds the stale dist; skips outside Chromium. */
async function mixedSetup(page: Page, browserName: string, root: string) {
  test.skip(browserName !== 'chromium', 'smoke:live drives its own Chromium; one run covers it');
  await page.goto('/about');
  const line = await page.getByText(/Build commit:/).first().innerText();
  const commit = /Build commit:\s*([0-9a-f]{7,40})\b/i.exec(line)?.[1];
  test.skip(!commit, 'dist was built without VITE_GIT_COMMIT');
  expect(STALE_COMMIT.startsWith((commit as string).toLowerCase())).toBe(false);
  const staleDir = buildStaleDist(root);
  // The two builds must differ where the edge mix-up shows: the entry chunk.
  expect(entryOf(staleDir)).not.toBe(entryOf(path.join(root, 'dist')));
  return { commit: commit as string, staleDir };
}

async function smokeAgainstMixed(root: string, port: number, staleDir: string, staleMs: number, commit: string) {
  const server = spawn(process.execPath, [
    path.join(root, 'tools', 'serve-dist.mjs'), '--host', '127.0.0.1', '--port', String(port),
    '--stale-dir', staleDir, '--stale-ms', String(staleMs)
  ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await waitForOutput(server, /serve-dist: serving/, 30_000);
    const smoke = spawn(process.execPath, [
      path.join(root, 'tools', 'smoke-live.mjs'), '--url', `http://127.0.0.1:${port}`, '--commit', commit
    ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    return await runToEnd(smoke);
  } finally {
    server.kill();
  }
}

test('live smoke waits out old and new versions answering side by side, then passes every strict step', async ({ page, browserName }, testInfo) => {
  test.setTimeout(240_000);
  const root = path.dirname(testInfo.config.configFile ?? path.resolve('playwright.config.ts'));
  const { commit, staleDir } = await mixedSetup(page, browserName, root);
  try {
    const { code, output } = await smokeAgainstMixed(root, MIXED_PORT, staleDir, MIXED_MS, commit);
    // The wait saw mismatching probes in the mixed window and still required a stable streak.
    expect(output, output).toMatch(/smoke:live: expected build served after \d+\.\d s: stable on 5 consecutive probes at least 3 s apart \([1-9]\d* of \d+ probes mismatched\)/);
    // Every direct fetch checked that the shell's entry script embeds the expected commit.
    expect(output.match(new RegExp(`^PASS fetch \\S+ \\|.*\\| observed: [^|]*build commit ${commit}`, 'gim'))?.length, output).toBe(7);
    expect(output, output).toMatch(/smoke:live: PASS all 12 steps/);
    expect(code, output).toBe(0);
  } finally {
    rmSync(staleDir, { recursive: true, force: true });
  }
});

test('live smoke fails when the old version keeps answering beside the new one', async ({ page, browserName }, testInfo) => {
  test.setTimeout(240_000);
  const root = path.dirname(testInfo.config.configFile ?? path.resolve('playwright.config.ts'));
  const { commit, staleDir } = await mixedSetup(page, browserName, root);
  try {
    const { code, output } = await smokeAgainstMixed(root, PERSISTENT_PORT, staleDir, PERSISTENT_MS, commit);
    expect(output, output).toMatch(/smoke:live: expected build not confirmed \(.*streak \d of 5, \d+ of \d+ probes mismatched within 90 s\)/);
    expect(output, output).toMatch(/^FAIL about commit \|/m);
    // Each direct fetch got one response from each version, so none of them may pass.
    expect(output, output).not.toMatch(/^PASS fetch /m);
    expect(output.match(/^FAIL fetch /gm)?.length, output).toBe(7);
    expect(output, output).toMatch(/smoke:live: FAIL \d+ of 12 steps/);
    expect(code, output).toBe(1);
  } finally {
    rmSync(staleDir, { recursive: true, force: true });
  }
});
