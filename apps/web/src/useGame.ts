import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Action } from '@poker/contracts';
import { GUEST_OWNER, abandonActive, loadActive } from '@poker/persistence';
import type { ActiveSession } from '@poker/persistence';
import { RecordError, frame, isSettled, observe, restoreState } from '@poker/poker';
import { isBusy, playReducer } from './playMachine';
import type { Phase, PlayEvent, SaveOp } from './playMachine';
import { actAndSave, dealNext } from './session';
import { requestBot as defaultRequestBot } from './workerClient';

export const BOT_FAILED_MESSAGE = 'Bot decision failed.';
export const SAVE_FAILED_MESSAGE = 'Your action was not saved. Try again.';

export interface GameDeps {
  /** Injectable for hook tests; defaults to the real worker client. */
  requestBot?: typeof defaultRequestBot;
}

function saveMessage(e: unknown): string {
  // A RecordError means nothing was written; its message explains why.
  return e instanceof RecordError || (e instanceof Error && e.name === 'RecordError') ? e.message : SAVE_FAILED_MESSAGE;
}

export function useGame(deps: GameDeps = {}) {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [writable, setWritable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [restoreFailed, setRestoreFailed] = useState(false);
  const [phase, dispatch] = useReducer(playReducer, { kind: 'idle' } as Phase);
  // Mirrors `phase` synchronously so a second click in the same tick sees `saving` and is dropped.
  const phaseRef = useRef<Phase>(phase);
  const active = useRef<ActiveSession | null>(null);
  const live = useRef(false);
  const ownsLock = useRef(false);
  const operation = useRef<Promise<void> | null>(null);
  const tokens = useRef(0);
  const requestBot = useRef(deps.requestBot ?? defaultRequestBot);
  requestBot.current = deps.requestBot ?? defaultRequestBot;

  const send = useCallback((event: PlayEvent): void => {
    phaseRef.current = playReducer(phaseRef.current, event);
    dispatch(event);
  }, []);

  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    let release: (() => void) | undefined;
    async function read(): Promise<void> {
      try {
        const saved = await loadActive(GUEST_OWNER);
        const restored = saved ? { ...saved, state: restoreState(saved.state) } : null;
        if (controller.signal.aborted) return;
        active.current = restored; setSession(restored); setRestoreFailed(false); setError('');
      } catch {
        if (!controller.signal.aborted) { setRestoreFailed(true); setError('Saved game could not be loaded. Export your completed hands in Settings before discarding this unfinished hand.'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void (async () => {
      await read();
      if (controller.signal.aborted) return;
      if (!navigator.locks) { setError('This browser cannot safely lock saved games. Use a current Chrome, Firefox or Safari browser.'); return; }
      await navigator.locks.request(`poker-session-${GUEST_OWNER}`, { signal: controller.signal }, async () => {
        if (controller.signal.aborted) return;
        setLoading(true);
        await read(); // A waiting tab must load the latest committed state.
        if (controller.signal.aborted) return;
        ownsLock.current = true; setWritable(true);
        await new Promise<void>(resolve => { release = resolve; });
        await operation.current; // Never release ownership during a storage write.
      });
    })().catch(e => { if (!controller.signal.aborted) { setLoading(false); setError(String(e)); } });
    return () => { live.current = false; ownsLock.current = false; controller.abort(); release?.(); };
  }, []);

  /**
   * Runs one storage write inside a `saving` phase. Every exit path dispatches SAVE_OK or
   * SAVE_FAILED for the allocated token. On failure `active.current` keeps the last saved state.
   * With a `requestId` the write is the accepted bot decision (BOT_DECIDED, non-stale).
   */
  const runSave = useCallback((op: SaveOp, requestId: string | undefined, work: () => Promise<ActiveSession | null>): void => {
    if (!ownsLock.current || !live.current || operation.current) {
      if (requestId) send({ type: 'BOT_DECIDED', requestId, stale: true, token: 0 });
      return;
    }
    const token = ++tokens.current;
    send(requestId ? { type: 'BOT_DECIDED', requestId, stale: false, token } : { type: 'SAVE_STARTED', op, token });
    const now = phaseRef.current;
    if (now.kind !== 'saving' || now.token !== token) return; // Rejected: busy or not allowed from this phase.
    const task = (async () => {
      try {
        const next = await work();
        active.current = next;
        if (live.current) { setSession(next); setRestoreFailed(false); if (op === 'end') setError(''); }
        send({ type: 'SAVE_OK', token });
      } catch (e) {
        send({ type: 'SAVE_FAILED', token, message: saveMessage(e) });
      } finally { operation.current = null; }
    })();
    operation.current = task;
  }, [send]);

  const botTurn = !!session && !loading && !restoreFailed && writable && frame(session.state).actor === 'bot' && !isSettled(session.state);
  // True while the bot effect may own the phase; idle -> botThinking must not re-run the effect.
  const botEligible = phase.kind === 'idle' || phase.kind === 'botThinking';

  useEffect(() => {
    if (!botTurn || !botEligible || !session || phaseRef.current.kind !== 'idle') return;
    const expected = session;
    const requestId = crypto.randomUUID();
    const controller = new AbortController();
    send({ type: 'BOT_REQUESTED', requestId, sessionRef: expected });
    requestBot.current(observe(expected.state, 'bot'), expected.difficulty, controller.signal).then(decision => {
      if (controller.signal.aborted || !live.current || active.current !== expected) {
        send({ type: 'BOT_DECIDED', requestId, stale: true, token: 0 }); // Discarded unsaved.
        return;
      }
      runSave('bot', requestId, () => actAndSave(expected, decision.action));
    }, () => {
      send(controller.signal.aborted ? { type: 'BOT_CANCELLED', requestId } : { type: 'BOT_FAILED', requestId, message: BOT_FAILED_MESSAGE });
    });
    return () => { controller.abort(); send({ type: 'BOT_CANCELLED', requestId }); };
  }, [session, botTurn, botEligible, runSave, send]);

  function act(action: Action): void {
    const expected = active.current;
    if (!expected || session !== expected || frame(expected.state).actor !== 'hero' || isSettled(expected.state)) return;
    runSave('hero', undefined, () => actAndSave(expected, action));
  }

  const phaseMessage = phase.kind === 'botFailed' || phase.kind === 'saveFailed' ? phase.message : '';
  return {
    session, writable, loading, restoreFailed, phase,
    busy: isBusy(phase),
    error: error || phaseMessage,
    botFailed: phase.kind === 'botFailed',
    /** A failed bot decision, or a failed save of one, can be retried for the unchanged session. */
    canRetryBot: phase.kind === 'botFailed' || (phase.kind === 'saveFailed' && !!session && frame(session.state).actor === 'bot' && !isSettled(session.state)),
    act,
    next: () => { if (!restoreFailed && !loading) runSave('deal', undefined, () => dealNext(active.current)); },
    end: () => runSave('end', undefined, async () => { await abandonActive(GUEST_OWNER); return null; }),
    retry: () => send(phaseRef.current.kind === 'botFailed' ? { type: 'RETRY' } : { type: 'DISMISS' })
  };
}
