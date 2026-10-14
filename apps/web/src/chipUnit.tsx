import React from 'react';
import { GUEST_OWNER, getPreference, putPreference } from '@poker/persistence';
import type { ChipUnit } from './format';
import { useStoreStatus } from './storeStatus';
import { subscribeLocalDeletion, withPreferenceLock } from './localData';

export const PREFERENCE_LOAD_ERROR = 'Display preference could not be loaded.';
export const PREFERENCE_SAVE_ERROR = 'Display preference could not be saved.';

interface ChipUnitValue {
  unit: ChipUnit;
  /** Updates the context immediately; the write runs in the background. */
  setUnit(unit: ChipUnit): void;
  /** Back to chips without writing, e.g. after local data was deleted. */
  resetUnit(): void;
  error: string | null;
}

const ChipUnitContext = React.createContext<ChipUnitValue>({ unit: 'chips', setUnit: () => {}, resetUnit: () => {}, error: null });

export function ChipUnitProvider({ children }: { children: React.ReactNode }) {
  const store = useStoreStatus();
  const [unit, setUnitState] = React.useState<ChipUnit>('chips');
  const [error, setError] = React.useState<string | null>(null);
  const request = React.useRef(0);
  const pending = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    // Load once, after the boot-time open. A failed store keeps chips and writes nothing.
    if (!store.ready || store.failed) return;
    let readController: AbortController | undefined;
    const reconcile = (locked: boolean) => {
      readController?.abort();
      const controller = new AbortController();
      readController = controller;
      const id = request.current;
      const read = () => getPreference(GUEST_OWNER);
      void (locked ? withPreferenceLock(read, controller.signal) : read()).then(pref => {
        if (id === request.current && !controller.signal.aborted) { setUnitState(pref.chipsAsBb ? 'bb' : 'chips'); setError(null); }
      }).catch(() => { if (id === request.current && !controller.signal.aborted) setError(PREFERENCE_LOAD_ERROR); });
    };
    reconcile(!!navigator.locks);
    const unsubscribe = subscribeLocalDeletion(() => reconcile(true));
    return () => { unsubscribe(); readController?.abort(); request.current++; pending.current?.abort(); };
  }, [store.ready, store.failed]);

  const setUnit = React.useCallback((next: ChipUnit) => {
    const id = ++request.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setUnitState(next);
    setError(null);
    void withPreferenceLock(async () => {
      if (id !== request.current) return;
      const pref = await getPreference(GUEST_OWNER);
      await putPreference({ ...pref, chipsAsBb: next === 'bb' });
    }, controller.signal).then(() => {
      if (id === request.current) setError(null);
    }).catch(() => {
      if (id === request.current && !controller.signal.aborted) setError(PREFERENCE_SAVE_ERROR);
    });
  }, []);

  const resetUnit = React.useCallback(() => {
    request.current++;
    pending.current?.abort();
    setUnitState('chips');
    setError(null);
  }, []);

  const value = React.useMemo(() => ({ unit, setUnit, resetUnit, error }), [unit, setUnit, resetUnit, error]);
  return <ChipUnitContext.Provider value={value}>{children}</ChipUnitContext.Provider>;
}

export function useChipUnit(): ChipUnitValue {
  return React.useContext(ChipUnitContext);
}
