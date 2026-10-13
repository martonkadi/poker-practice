import React from 'react';
import { GUEST_OWNER, getPreference, putPreference } from '@poker/persistence';
import type { ChipUnit } from './format';
import { useStoreStatus } from './storeStatus';

export const PREFERENCE_LOAD_ERROR = 'Display preference could not be loaded.';
export const PREFERENCE_SAVE_ERROR = 'Display preference could not be saved.';

type AnimationSpeed = 'normal' | 'fast' | 'none';

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
  // Set once the user (or a reset) has chosen a unit, so a slow load cannot overwrite it.
  const decided = React.useRef(false);
  const loadStarted = React.useRef(false);
  // Kept from the loaded preference so saving the unit does not clobber it.
  const animationSpeed = React.useRef<AnimationSpeed>('none');
  // Serialises background writes so the last choice is the one stored.
  const writes = React.useRef<Promise<void>>(Promise.resolve());

  React.useEffect(() => {
    // Load once, after the boot-time open. A failed store keeps chips and writes nothing.
    if (!store.ready || loadStarted.current) return;
    loadStarted.current = true;
    if (store.failed) return;
    void getPreference(GUEST_OWNER).then(pref => {
      animationSpeed.current = pref.animationSpeed;
      if (!decided.current) setUnitState(pref.chipsAsBb ? 'bb' : 'chips');
    }).catch(() => {
      if (!decided.current) setError(PREFERENCE_LOAD_ERROR);
    });
  }, [store.ready, store.failed]);

  const setUnit = React.useCallback((next: ChipUnit) => {
    decided.current = true;
    setUnitState(next);
    setError(null);
    const pref = { owner: GUEST_OWNER, chipsAsBb: next === 'bb', animationSpeed: animationSpeed.current };
    writes.current = writes.current.then(() => putPreference(pref)).catch(() => setError(PREFERENCE_SAVE_ERROR));
  }, []);

  const resetUnit = React.useCallback(() => {
    decided.current = true;
    animationSpeed.current = 'none';
    setUnitState('chips');
    setError(null);
  }, []);

  const value = React.useMemo(() => ({ unit, setUnit, resetUnit, error }), [unit, setUnit, resetUnit, error]);
  return <ChipUnitContext.Provider value={value}>{children}</ChipUnitContext.Provider>;
}

export function useChipUnit(): ChipUnitValue {
  return React.useContext(ChipUnitContext);
}
