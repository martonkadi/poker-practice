import React from 'react';
import { useNavigate } from 'react-router';
import { GUEST_OWNER, deleteLocal, exportHands } from '@poker/persistence';
import { StoreFailedNotice, useStoreStatus } from '../storeStatus';
import { useChipUnit } from '../chipUnit';
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
  const store = useStoreStatus();
  const navigate = useNavigate();
  const { resetUnit } = useChipUnit();

  async function download() {
    setMessage('');
    let url: string | undefined;
    try {
      // Build the whole file before starting the download, so a failure downloads nothing (Req 6.8).
      const text = await exportHands(GUEST_OWNER);
      url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `headsup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      const done = url;
      setTimeout(() => URL.revokeObjectURL(done), 1000);
    } catch {
      if (url) URL.revokeObjectURL(url);
      setMessage(EXPORT_FAILED_MESSAGE);
    }
  }

  async function clear() {
    // Cancelling keeps everything and stays here (Req 6.3, 6.5).
    if (!window.confirm(DELETE_CONFIRM_MESSAGE)) return;
    setMessage('');
    if (!navigator.locks) { setMessage(DELETE_NO_LOCKS_MESSAGE); return; }
    setBusy(true);
    let outcome: DeleteOutcome;
    try {
      outcome = await navigator.locks.request(SESSION_LOCK, { ifAvailable: true }, async (lock): Promise<DeleteOutcome> => {
        // Another tab holds the table: touch nothing (Req 6.6).
        if (!lock) return 'locked';
        // One transaction: hands, bookmarks, active session and preference go together or not at all (Req 6.4, 6.7).
        await deleteLocal(GUEST_OWNER);
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
    void navigate('/');
  }

  return <div className={styles.page}><span className={styles.eyebrow}>YOUR DATA</span><h1>Settings</h1><StoreFailedNotice /><section className={styles.settingsCard}><h2>Saved in this browser</h2><p>There is no account or cloud backup in this MVP. Clearing browser data deletes your saved hands, and they are not available on other devices. Export a JSON archive to keep a copy. Archive import is not available in this MVP.</p><div className={styles.actions}><button onClick={() => void download()}>Export JSON</button></div><button className={styles.danger} disabled={busy || !store.writable} onClick={() => void clear()}>Delete local data</button></section>{message && <p role="status">{message}</p>}</div>;
}
