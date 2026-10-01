import { decide } from '@poker/bots';
import type { Difficulty, PlayerObservation } from '@poker/contracts';

/** The only messages the bot worker accepts (Req 4.5, 5.4). */
export type BotWorkerMessage =
  | { kind: 'decide'; id: string; observation: PlayerObservation; difficulty: Difficulty }
  | { kind: 'cancel'; id: string };

const requests = new Map<string, AbortController>();
self.onmessage = async (event: MessageEvent<BotWorkerMessage>) => {
  const message = event.data;
  if (message.kind === 'cancel') { requests.get(message.id)?.abort(); return; }
  if (message.kind !== 'decide') return;
  const controller = new AbortController();
  requests.set(message.id, controller);
  try {
    const deadline = performance.now() + 1500;
    const value = await decide(message.observation, message.difficulty, { signal: controller.signal, deadline });
    if (!controller.signal.aborted) self.postMessage({ id: message.id, ok: true, value });
  } catch (error) {
    if (!controller.signal.aborted) self.postMessage({ id: message.id, ok: false, error: error instanceof Error ? error.message : 'Bot worker failed' });
  } finally { requests.delete(message.id); }
};
