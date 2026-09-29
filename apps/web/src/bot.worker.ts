import { decide } from '@poker/bots';
import { estimateEquity } from '@poker/analysis';
import type { Difficulty, PlayerObservation } from '@poker/contracts';

const requests = new Map<string, AbortController>();
self.onmessage = async (event: MessageEvent<
  { kind: 'decide'; id: string; observation: PlayerObservation; difficulty: Difficulty } |
  { kind: 'equity'; id: string; observation: Pick<PlayerObservation, 'hole' | 'board'> } |
  { kind: 'cancel'; id: string }
>) => {
  const message = event.data;
  if (message.kind === 'cancel') { requests.get(message.id)?.abort(); return; }
  const controller = new AbortController();
  requests.set(message.id, controller);
  try {
    const deadline = performance.now() + 1500;
    const value = message.kind === 'decide'
      ? await decide(message.observation, message.difficulty, { signal: controller.signal, deadline })
      : await estimateEquity(message.observation, { samples: 2048, signal: controller.signal, deadline });
    if (!controller.signal.aborted) self.postMessage({ id: message.id, ok: true, value });
  } catch (error) {
    if (!controller.signal.aborted) self.postMessage({ id: message.id, ok: false, error: error instanceof Error ? error.message : 'Bot worker failed' });
  } finally { requests.delete(message.id); }
};
