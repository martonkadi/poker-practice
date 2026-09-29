import type { BotDecision } from '@poker/bots';
import type { EquityEstimate } from '@poker/analysis';
import type { Difficulty, PlayerObservation } from '@poker/contracts';

const worker = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();
worker.onmessage = (event: MessageEvent<{ id: string; ok: boolean; value?: unknown; error?: string }>) => {
  const item = pending.get(event.data.id);
  if (!item) return;
  clearTimeout(item.timer);
  pending.delete(event.data.id);
  if (event.data.ok) item.resolve(event.data.value); else item.reject(new Error(event.data.error ?? 'Bot worker failed'));
};
worker.onerror = () => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Bot worker crashed')); } pending.clear(); };
function request<T>(payload: Record<string, unknown>): Promise<T> {
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); worker.postMessage({ kind: 'cancel', id }); reject(new Error('Bot computation timed out')); }, 3000);
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
    worker.postMessage({ ...payload, id });
  });
}
export function requestBot(observation: PlayerObservation, difficulty: Difficulty): Promise<BotDecision> { return request<BotDecision>({ kind: 'decide', observation, difficulty }); }
export function requestEquity(observation: Pick<PlayerObservation, 'hole' | 'board'>): Promise<EquityEstimate> { return request<EquityEstimate>({ kind: 'equity', observation }); }
