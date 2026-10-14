// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { startHandsExport } from './exportClient';

class FakeWorker {
  static latest: FakeWorker;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { FakeWorker.latest = this; }
  reply(data: unknown) { this.onmessage?.({ data } as MessageEvent); }
}
afterEach(() => vi.unstubAllGlobals());

it('returns the final Blob and forwards progress, terminating the worker', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  const progress = vi.fn(), job = startHandsExport('guest', progress), worker = FakeWorker.latest;
  expect(worker.postMessage).toHaveBeenCalledWith({ owner: 'guest' });
  worker.reply({ type: 'progress', completed: 100, total: 200 });
  expect(progress).toHaveBeenCalledWith({ completed: 100, total: 200 });
  const blob = new Blob(['{}']); worker.reply({ type: 'complete', blob });
  expect(await job.result).toBe(blob); expect(worker.terminate).toHaveBeenCalledTimes(1);
});

it('rejects on cancellation and ignores replies from the terminated worker', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  const progress = vi.fn(), job = startHandsExport('guest', progress), worker = FakeWorker.latest;
  const rejected = expect(job.result).rejects.toMatchObject({ name: 'AbortError' });
  job.cancel(); worker.reply({ type: 'progress', completed: 1, total: 1 }); worker.reply({ type: 'complete', blob: new Blob() });
  await rejected; expect(progress).not.toHaveBeenCalled(); expect(worker.terminate).toHaveBeenCalledTimes(1);
});

it.each(['error', 'messageerror', 'reply'])('rejects worker %s failures without a Blob', async failure => {
  vi.stubGlobal('Worker', FakeWorker);
  const job = startHandsExport('guest', vi.fn()), worker = FakeWorker.latest;
  if (failure === 'error') worker.onerror?.(); else if (failure === 'messageerror') worker.onmessageerror?.(); else worker.reply({ type: 'error' });
  await expect(job.result).rejects.toThrow(); expect(worker.terminate).toHaveBeenCalled();
});

it('terminates a worker whose initial message cannot be sent', async () => {
  class BrokenWorker extends FakeWorker { postMessage = vi.fn(() => { throw new Error('Cannot send'); }); }
  vi.stubGlobal('Worker', BrokenWorker);
  const job = startHandsExport('guest', vi.fn());
  await expect(job.result).rejects.toThrow('could not start'); expect(FakeWorker.latest.terminate).toHaveBeenCalledTimes(1);
});
