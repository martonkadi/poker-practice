import type { BotDecision } from '@poker/bots';
import type { Difficulty, PlayerObservation } from '@poker/contracts';

let worker: Worker | null = null;
const pending = new Map<string, { resolve: (value: BotDecision) => void; reject: (reason: Error) => void; cleanup: () => void }>();
function resetWorker(reason: Error): void {
  worker?.terminate(); worker = null;
  for (const item of pending.values()) { item.cleanup(); item.reject(reason); }
  pending.clear();
}
function getWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
  created.onmessage = (event: MessageEvent<{ id: string; ok: boolean; value: BotDecision; error?: string }>) => {
    const item = pending.get(event.data.id);
    if (!item) return;
    pending.delete(event.data.id); item.cleanup();
    if (event.data.ok) item.resolve(event.data.value);
    else item.reject(new Error(event.data.error ?? 'Bot failed. Retry this decision.'));
  };
  created.onerror = () => resetWorker(new Error('Bot worker crashed. Retry this decision.'));
  worker = created;
  return created;
}
export function requestBot(observation: PlayerObservation, difficulty: Difficulty, signal: AbortSignal = new AbortController().signal): Promise<BotDecision> {
  if (signal.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const cancel = () => resetWorker(new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => resetWorker(new Error('Bot timed out. Retry this decision.')), 5000);
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', cancel); };
    pending.set(id, { resolve, reject, cleanup });
    signal.addEventListener('abort', cancel, { once: true });
    try { getWorker().postMessage({ kind: 'decide', id, observation, difficulty }); }
    catch { resetWorker(new Error('Could not start the bot. Retry this decision.')); }
  });
}
