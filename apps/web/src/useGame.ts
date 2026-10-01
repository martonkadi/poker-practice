import { useEffect, useRef, useState } from 'react';
import type { Action } from '@poker/contracts';
import { GUEST_OWNER, abandonActive, loadActive } from '@poker/persistence';
import type { ActiveSession } from '@poker/persistence';
import { frame, isSettled, observe, restoreState } from '@poker/poker';
import { actAndSave, dealNext } from './session';
import { requestBot } from './workerClient';

export function useGame() {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [writable, setWritable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [restoreFailed, setRestoreFailed] = useState(false);
  const active = useRef<ActiveSession | null>(null);
  const live = useRef(false);
  const ownsLock = useRef(false);
  const operation = useRef<Promise<void> | null>(null);

  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    let release: (() => void) | undefined;
    async function read(): Promise<void> {
      try {
        const saved = await loadActive(GUEST_OWNER);
        const restored = saved ? { ...saved, state: restoreState(saved.state) } : null;
        if (controller.signal.aborted) return;
        active.current = restored; setSession(restored); setRestoreFailed(false);
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

  function change(work: () => Promise<ActiveSession | null>): void {
    if (!ownsLock.current || operation.current || !live.current) return;
    setBusy(true); setError('');
    const task = (async () => {
      try {
        const next = await work();
        active.current = next;
        if (live.current) { setSession(next); setRestoreFailed(false); }
      } catch (e) { if (live.current) setError(e instanceof Error ? e.message : 'Could not save the action. Try again.'); }
      finally { operation.current = null; if (live.current) setBusy(false); }
    })();
    operation.current = task;
  }

  function commit(action: Action, expected: ActiveSession | null, bot = false): void {
    if (!expected || active.current !== expected || frame(expected.state).actor !== (bot ? 'bot' : 'hero')) return;
    change(() => actAndSave(expected, action));
  }

  useEffect(() => {
    if (!session || !writable || loading || restoreFailed || error || frame(session.state).actor !== 'bot' || isSettled(session.state)) return;
    const controller = new AbortController();
    const expected = session;
    setBusy(true);
    void requestBot(observe(expected.state, 'bot'), expected.difficulty, controller.signal).then(decision => {
      if (controller.signal.aborted || !live.current || active.current !== expected) return;
      commit(decision.action, expected, true);
    }).catch(e => {
      if (!controller.signal.aborted && live.current) { setBusy(false); setError(e instanceof Error ? e.message : 'Bot failed. Retry this decision.'); }
    });
    return () => controller.abort();
  }, [session, writable, loading, restoreFailed, error]);

  return {
    session, writable, loading, busy, error, restoreFailed,
    act: (action: Action) => commit(action, session),
    next: () => { if (!restoreFailed && !loading) change(() => dealNext(active.current)); },
    end: () => change(async () => { await abandonActive(GUEST_OWNER); return null; }),
    retry: () => setError('')
  };
}
