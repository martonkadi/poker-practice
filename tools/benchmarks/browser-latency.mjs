import { spawn } from 'node:child_process';
import os from 'node:os';
import { chromium } from '@playwright/test';

const url = 'http://127.0.0.1:4174';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'vite.config.ts', '--host', '127.0.0.1', '--port', '4174', '--strictPort'], {
  cwd: process.cwd(), stdio: 'ignore'
});
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('Vite exited before the browser benchmark');
    try { ready = (await fetch(url)).ok; } catch { /* Waiting for Vite. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Vite did not become ready');
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);
  const results = await page.evaluate(async () => {
    const { requestBot } = await import('/src/workerClient.ts');
    const observation = {
      handId: crypto.randomUUID(), sequence: 1, actor: 'bot', hole: [0, 13], board: [],
      street: 'preflop', button: 'hero', pot: 200,
      stacks: { hero: 9900, bot: 9900 }, commitments: { hero: 100, bot: 100 },
      history: [{ actor: 'hero', street: 'preflop', action: { kind: 'call' }, amount: 50 }],
      legal: { fold: false, check: true, call: null, raise: { min: 200, max: 10_000 }, allInTo: 10_000 },
      highestBet: 100
    };
    const output = {};
    for (const difficulty of ['standard', 'easy']) {
      const samples = [];
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        const decision = await requestBot(observation, difficulty);
        if (!decision?.action) throw new Error('Missing bot action');
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      output[difficulty] = { decisions: samples.length, medianMs: Math.round(samples[14]), p95Ms: Math.round(samples[Math.ceil(0.95 * samples.length) - 1]), maxMs: Math.round(samples.at(-1)) };
    }
    return output;
  });
  console.log(JSON.stringify({
    machine: { platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryGiB: +(os.totalmem() / 2 ** 30).toFixed(1) },
    browser: browser.version(), scope: '30 repeated preflop worker requests per difficulty, same legal observation, Web Worker round-trip included',
    results
  }, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
