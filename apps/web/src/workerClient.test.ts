// @vitest-environment happy-dom
// The bot worker receives only the bot's observation (captures the posted payload).
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PlayerObservation } from '@poker/contracts';
import { applyAction, createHand, frame, hole, observe } from '@poker/poker';
import type { EngineState } from '@poker/poker';

let posted: { worker: FakeWorker; message: unknown }[] = [];
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  constructor(readonly url: string | URL, readonly options?: WorkerOptions) {}
  postMessage(message: unknown): void { posted.push({ worker: this, message: structuredClone(message) }); }
  terminate(): void {}
}

beforeEach(() => { posted = []; vi.stubGlobal('Worker', FakeWorker); vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });

/** Posts one bot request, captures the payload, then answers it so the module has nothing pending. */
async function capture(state: EngineState): Promise<{ message: Record<string, unknown>; obs: PlayerObservation }> {
  const { requestBot } = await import('./workerClient');
  const obs = observe(state, 'bot');
  const result = requestBot(obs, 'standard', new AbortController().signal);
  expect(posted).toHaveLength(1);
  const { worker, message } = posted[0]!;
  const { id } = message as { id: string };
  worker.onmessage?.({ data: { id, ok: true, value: { action: { kind: 'call' }, botVersion: 'standard-v1' } } } as MessageEvent);
  await result;
  return { message: message as Record<string, unknown>, obs };
}

function expectIsolated(message: Record<string, unknown>, obs: PlayerObservation, state: EngineState): void {
  expect(Object.keys(message).sort()).toEqual(['difficulty', 'id', 'kind', 'observation']);
  expect(message.kind).toBe('decide');
  expect(message.difficulty).toBe('standard');
  expect(message.observation).toEqual(obs);
  const sent = message.observation as PlayerObservation;
  expect(sent.hole).toEqual(hole(state, 'bot'));
  for (const c of hole(state, 'hero')) expect([...sent.hole, ...sent.board]).not.toContain(c);
}

it('posts exactly { kind, id, observation, difficulty } with the preflop bot observation', async () => {
  // Bot on the button acts first preflop.
  const state = await createHand('bot');
  expect(frame(state).actor).toBe('bot');
  const { message, obs } = await capture(state);
  expectIsolated(message, obs, state);
  expect((message.observation as PlayerObservation).board).toEqual([]);
});

it('posts only the dealt flop to the worker on a postflop bot decision', async () => {
  // Hero on the button: hero calls, bot checks to the flop, where the bot (big blind) acts first.
  let state = await createHand('hero');
  state = await applyAction(state, 'hero', { kind: 'call' });
  state = await applyAction(state, 'bot', { kind: 'check' });
  expect(frame(state).street).toBe('flop');
  expect(frame(state).actor).toBe('bot');
  const { message, obs } = await capture(state);
  expectIsolated(message, obs, state);
  expect((message.observation as PlayerObservation).board).toEqual(frame(state).board);
  expect((message.observation as PlayerObservation).board).toHaveLength(3);
});
