import React from 'react';
import { openStore } from '@poker/persistence';
import type { StoreStatus } from '@poker/persistence';

export const STORE_FAILED_MESSAGE = 'Saved hands could not be loaded. They have not been deleted.';

/** `pending` while the boot-time open is in flight; writes stay disabled until `ok`. */
export type StoreState = { status: 'pending' } | ({ status: 'ready' } & StoreStatus);

const StoreStatusContext = React.createContext<StoreState>({ status: 'pending' });

let boot: Promise<StoreStatus> | undefined;
/** Opens the store at most once per page load, even under StrictMode double effects. */
function openOnce(): Promise<StoreStatus> {
  boot ??= openStore();
  return boot;
}

export function StoreStatusProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<StoreState>({ status: 'pending' });
  React.useEffect(() => {
    let live = true;
    void openOnce().then(result => { if (live) setState({ status: 'ready', ...result }); });
    return () => { live = false; };
  }, []);
  return <StoreStatusContext.Provider value={state}>{children}</StoreStatusContext.Provider>;
}

export function useStoreStatus(): { ready: boolean; writable: boolean; failed: boolean } {
  const state = React.useContext(StoreStatusContext);
  const ready = state.status === 'ready';
  const failed = ready && !state.ok;
  return { ready, writable: ready && state.ok, failed };
}

export function StoreFailedNotice() {
  const { failed } = useStoreStatus();
  return failed ? <p role="alert">{STORE_FAILED_MESSAGE}</p> : null;
}
