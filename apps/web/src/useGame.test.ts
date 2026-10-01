// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Action, LegalActionSet, PlayerObservation } from '@poker/contracts';
import { deleteLocal, GUEST_OWNER, loadActive, saveActive } from '@poker/persistence';
import { frame } from '@poker/poker';
import { controlsFor } from './playMachine';
import { actAndSave, dealNext } from './session';
import { BOT_FAILED_MESSAGE, SAVE_FAILED_MESSAGE, useGame } from './useGame';

// Real store (fake-indexeddb) with saveActive wrapped so a test can make one write fail.
vi.mock('@poker/persistence', async importOriginal => {
  const real = await importOriginal<typeof import('@poker/persistence')>();
  return { ...real, saveActive: vi.fn(real.saveActive) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// --- Fake Worker: the real workerClient.requestBot creates it and posts `decide` messages to it.
interface DecideMessage { kind: 'decide'; id: string; observation: PlayerObservation; difficulty: string }
interface Request { worker: FakeWorker; message: DecideMessage }
let requests: Request[] = [];
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  terminated = false;
  constructor(readonly url: string | URL, readonly options?: WorkerOptions) {}
  postMessage(message: DecideMessage): void { requests.push({ worker: this, message }); }
  terminate(): void { this.terminated = true; }
}
vi.stubGlobal('Worker', FakeWorker);

/** A raise keeps the hand going with the hero to act; otherwise check or call. */
function botAction(legal: LegalActionSet): Action {
  if (legal.raise) return { kind: 'raiseTo', amount: legal.raise.min };
  return legal.check ? { kind: 'check' } : { kind: 'call' };
}
function answer(request: Request): void {
  const { id, observation } = request.message;
  request.worker.onmessage?.({ data: { id, ok: true, value: { action: botAction(observation.legal), botVersion: 'standard-v1' } } } as MessageEvent);
}
function fail(request: Request): void {
  request.worker.onmessage?.({ data: { id: request.message.id, ok: false, error: 'boom' } } as MessageEvent);
}

// --- Fake Web Locks: one exclusive holder per name, queued, abortable while waiting.
const lockQueues = new Map<string, Promise<void>>();
const fakeLocks = {
  request(name: string, options: { signal?: AbortSignal }, callback: () => Promise<unknown>): Promise<unknown> {
    const previous = lockQueues.get(name) ?? Promise.resolve();
    let done!: () => void;
    const held = new Promise<void>(resolve => { done = resolve; });
    lockQueues.set(name, previous.then(() => held));
    return previous.then(async () => {
      try {
        if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        return await callback();
      } finally { done(); }
    });
  }
};
Object.defineProperty(navigator, 'locks', { value: fakeLocks, configurable: true });

// --- Tiny renderHook.
type Game = ReturnType<typeof useGame>;
interface Mounted { readonly game: Game; root: Root; unmount(): void }
function mount(): Mounted {
  let current: Game | null = null;
  function Probe() { current = useGame(); return null; }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Probe)));
  return { get game() { return current!; }, root, unmount: () => act(() => root.unmount()) };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    if (check()) return;
    await act(tick);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

/** Mirrors Play in main.tsx: the hero's legal controls are enabled and busy is clear. */
function expectHeroControlsEnabled(game: Game): void {
  expect(game.busy).toBe(false);
  expect(game.session).not.toBeNull();
  const table = frame(game.session!.state);
  expect(table.actor).toBe('hero');
  const enabled = game.writable && !game.busy && !game.loading && !game.restoreFailed;
  const controls = controlsFor(table.legal, !enabled);
  expect(controls).toEqual(controlsFor(table.legal, false));
  expect(Object.values(controls).some(Boolean)).toBe(true);
}
async function savedDecisions(): Promise<number> { return (await loadActive(GUEST_OWNER))!.decisions.length; }
/** Saved hand where the hero (button) limped and the bot is to act. */
async function seedBotTurn(): Promise<void> { await actAndSave(await dealNext(null), { kind: 'call' }); }
async function botThinking(game: () => Game, count: number): Promise<void> {
  await until(() => requests.length === count && game().phase.kind === 'botThinking', `bot request ${count}`);
}

let mounted: Mounted[] = [];
function track(m: Mounted): Mounted { mounted.push(m); return m; }
beforeEach(() => { requests = []; mounted = []; });
afterEach(async () => {
  for (const m of mounted) m.unmount();
  vi.useRealTimers();
  vi.mocked(saveActive).mockClear();
  await deleteLocal(GUEST_OWNER);
});

it('2.1 discards a bot decision that arrives after the active session changed, unsaved, and recovers', async () => {
  await seedBotTurn();
  const first = mount();
  await botThinking(() => first.game, 1);
  // The decision arrives in the same tick the session is replaced (navigation to a fresh Play).
  act(() => { answer(requests[0]!); first.root.unmount(); });
  await act(tick);
  expect(await savedDecisions()).toBe(1); // Only the hero's limp: the late decision was not saved.

  const second = track(mount());
  await botThinking(() => second.game, 2);
  expect(second.game.error).toBe('');
  act(() => answer(requests[1]!));
  await until(() => !second.game.busy && frame(second.game.session!.state).actor === 'hero', 'hero turn');
  expect(await savedDecisions()).toBe(2);
  expect(second.game.error).toBe('');
  expectHeroControlsEnabled(second.game);
});

it('2.2 cancels a pending bot request on unmount without saving or showing an error', async () => {
  await seedBotTurn();
  const first = mount();
  await botThinking(() => first.game, 1);
  first.unmount();
  await act(tick);
  expect(requests[0]!.worker.terminated).toBe(true); // workerClient cancelled the request.
  act(() => answer(requests[0]!)); // A late reply for the cancelled request is ignored.
  await act(tick);
  expect(await savedDecisions()).toBe(1);

  const second = track(mount());
  await botThinking(() => second.game, 2);
  expect(second.game.error).toBe('');
  expect(second.game.botFailed).toBe(false);
  act(() => answer(requests[1]!));
  await until(() => !second.game.busy && frame(second.game.session!.state).actor === 'hero', 'hero turn');
  expect(await savedDecisions()).toBe(2);
  expectHeroControlsEnabled(second.game);
});

async function expectBotFailedThenRetry(game: () => Game, savedBefore: Awaited<ReturnType<typeof loadActive>>): Promise<void> {
  await until(() => game().botFailed, 'bot failure');
  expect(game().error).toBe(BOT_FAILED_MESSAGE);
  expect(game().busy).toBe(false);
  expect(game().canRetryBot).toBe(true);
  expect(game().session!.state.activeSnapshot).toEqual(savedBefore!.state.activeSnapshot);
  expect(await savedDecisions()).toBe(1);

  act(() => game().retry());
  await botThinking(game, 2); // Exactly one new request.
  expect(game().error).toBe('');
  expect(requests[1]!.message.observation).toEqual(requests[0]!.message.observation); // Same unchanged state.
  act(() => answer(requests[1]!));
  await until(() => !game().busy && frame(game().session!.state).actor === 'hero', 'hero turn');
  expect(requests).toHaveLength(2);
  expect(await savedDecisions()).toBe(2);
  expect(game().error).toBe('');
  expect(game().botFailed).toBe(false);
  expectHeroControlsEnabled(game());
}

it('2.4/2.5 shows "Bot decision failed." when the bot fails, then Retry bot sends one new request and recovers', async () => {
  await seedBotTurn();
  const before = await loadActive(GUEST_OWNER);
  const view = track(mount());
  await botThinking(() => view.game, 1);
  act(() => fail(requests[0]!));
  await expectBotFailedThenRetry(() => view.game, before);
});

it('2.4/2.5 shows "Bot decision failed." when the bot times out, then Retry bot sends one new request and recovers', async () => {
  await seedBotTurn();
  const before = await loadActive(GUEST_OWNER);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const view = track(mount());
  await botThinking(() => view.game, 1);
  act(() => { vi.advanceTimersByTime(5000); });
  expect(requests[0]!.worker.terminated).toBe(true);
  await expectBotFailedThenRetry(() => view.game, before);
});

it('2.6 keeps the last saved state and shows "Your action was not saved. Try again." when a save fails', async () => {
  await dealNext(null); // Hero (button) to act preflop.
  const saved = await loadActive(GUEST_OWNER);
  const view = track(mount());
  await until(() => view.game.writable && !view.game.loading && !!view.game.session, 'writable session');
  const shown = view.game.session;
  vi.mocked(saveActive).mockClear();
  vi.mocked(saveActive).mockRejectedValueOnce(new Error('disk full'));
  act(() => view.game.act({ kind: 'call' }));
  await until(() => view.game.phase.kind === 'saveFailed', 'save failure');
  expect(saveActive).toHaveBeenCalledTimes(1);
  expect(view.game.error).toBe(SAVE_FAILED_MESSAGE);
  expect(view.game.session).toBe(shown);
  expect((await loadActive(GUEST_OWNER))!.state.activeSnapshot).toEqual(saved!.state.activeSnapshot);
  expect(await savedDecisions()).toBe(0);
  expect(requests).toHaveLength(0); // The unsaved action did not hand the turn to the bot.
  expectHeroControlsEnabled(view.game);
});
