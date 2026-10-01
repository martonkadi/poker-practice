// Regression test for the first live deploy of 9d15c68 (2026-10-01). `wrangler deploy`
// had returned, but Cloudflare's edge still answered the smoke check's first direct
// requests with bare 404s (no app shell, no `_headers` values). The smoke check failed
// 8 of 12 steps although the same deployment passed every step minutes later.
//
// This serves the same dist through tools/serve-dist.mjs with `--unrouted-ms`, which
// answers every request with such a 404 for the first seconds, and requires
// `pnpm smoke:live` to wait it out and then pass every step with its strict checks.
// Chromium only: the smoke check drives its own Chromium.
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { test, expect } from './fixtures';

const PORT = 4183;
const UNROUTED_MS = 8_000;

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
