import React from 'react';
import { useNavigate } from 'react-router';
import { GUEST_OWNER, deleteLocal } from '@poker/persistence';
import { StoreFailedNotice, useStoreStatus } from '../storeStatus';
import { useChipUnit } from '../chipUnit';
import { notifyLocalDeletion, withPreferenceLock } from '../localData';
import { startHandsExport, type ExportProgress } from '../exportClient';
import styles from '../styles.module.css';

export const EXPORT_FAILED_MESSAGE = 'Export failed. Your saved data has not been changed.';
export const DELETE_CONFIRM_MESSAGE = 'Delete all guest poker data saved in this browser? Export your hands first.';
export const DELETE_LOCKED_MESSAGE = 'Close the practice table in other tabs before deleting data.';
export const DELETE_NO_LOCKS_MESSAGE = 'Safe deletion requires a browser with Web Locks. Nothing was deleted.';
export const DELETE_FAILED_MESSAGE = 'Deletion did not complete. Try again.';
/** Same lock the play table holds while a session is open (see useGame). */
const SESSION_LOCK = `poker-session-${GUEST_OWNER}`;

type DeleteOutcome = 'deleted' | 'locked';

export function Settings() {
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<ExportProgress | null>(null);
  const exporting = React.useRef<ReturnType<typeof startHandsExport> | null>(null);
  React.useEffect(() => () => { exporting.current?.cancel(); exporting.current = null; }, []);
  const store = useStoreStatus();
  const navigate = useNavigate();
  const { resetUnit } = useChipUnit();

  async function download() {
    if (exporting.current || busy) return;
    setMessage('');
    let url: string | undefined;
    let job: ReturnType<typeof startHandsExport> | undefined;
    try {
      setProgress({ completed: 0, total: 0 });
      job = startHandsExport(GUEST_OWNER, value => setProgress(value));
      exporting.current = job;
      const blob = await job.result;
      if (exporting.current !== job) return;
      url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `headsup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      const done = url;
      setTimeout(() => URL.revokeObjectURL(done), 1000);
    } catch {
      if (url) URL.revokeObjectURL(url);
      if (!job || exporting.current === job) setMessage(EXPORT_FAILED_MESSAGE);
    } finally {
      if (!job || exporting.current === job) { exporting.current = null; setProgress(null); }
    }
  }

  function cancelExport() {
    exporting.current?.cancel();
    exporting.current = null;
    setProgress(null);
    setMessage('Export cancelled.');
  }

  async function clear() {
    if (exporting.current || busy) return;
    // Cancelling keeps everything and stays here.
    if (!window.confirm(DELETE_CONFIRM_MESSAGE)) return;
    setMessage('');
    if (!navigator.locks) { setMessage(DELETE_NO_LOCKS_MESSAGE); return; }
    setBusy(true);
    let outcome: DeleteOutcome;
    try {
      outcome = await navigator.locks.request(SESSION_LOCK, { ifAvailable: true }, async (lock): Promise<DeleteOutcome> => {
        // Another tab holds the table: touch nothing.
        if (!lock) return 'locked';
        // One transaction: hands, bookmarks, active session and preference go together or not at all.
        await withPreferenceLock(() => deleteLocal(GUEST_OWNER));
        return 'deleted';
      });
    } catch {
      setBusy(false);
      setMessage(DELETE_FAILED_MESSAGE);
      return;
    }
    setBusy(false);
    if (outcome === 'locked') { setMessage(DELETE_LOCKED_MESSAGE); return; }
    resetUnit();
    notifyLocalDeletion();
    void navigate('/');
  }

  return <div className={styles.page}><span className={styles.eyebrow}>YOUR DATA</span><h1>Settings</h1><StoreFailedNotice /><section className={styles.settingsCard}><h2>Saved in this browser</h2><p>There is no account or cloud backup in this MVP. Clearing browser data deletes your saved hands, and they are not available on other devices. Export a JSON archive to keep a copy. Archive import is not available in this MVP.</p><div className={styles.actions}><button disabled={busy || progress !== null || !store.writable} onClick={() => void download()}>Export JSON</button>{progress !== null && <button onClick={cancelExport}>Cancel export</button>}</div>{progress !== null && <p role="status">Exporting {progress.completed.toLocaleString()} of {progress.total.toLocaleString()} hands…</p>}<button className={styles.danger} disabled={busy || progress !== null || !store.writable} onClick={() => void clear()}>Delete local data</button></section>{message && <p role="status">{message}</p>}</div>;
}
