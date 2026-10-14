import React from 'react';
import { Link } from 'react-router';
import { cardToText } from '@poker/contracts';
import type { HandRecord } from '@poker/contracts';
import { GUEST_OWNER, getHandsPage, HANDS_PAGE_SIZE } from '@poker/persistence';
import { StoreFailedNotice, useStoreStatus } from '../storeStatus';
import { useChipUnit } from '../chipUnit';
import { formatAmount } from '../format';
import { subscribeLocalDeletion } from '../localData';
import styles from '../styles.module.css';

export function History() {
  const [hands, setHands] = React.useState<HandRecord[] | null>(null);
  const [error, setError] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [revision, refresh] = React.useReducer((value: number) => value + 1, 0);
  const store = useStoreStatus();
  const { unit } = useChipUnit();
  React.useEffect(() => subscribeLocalDeletion(refresh), []);
  React.useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    void getHandsPage(GUEST_OWNER, page).then(result => {
      if (!current) return;
      setHands(result.hands); setTotal(result.total); setPage(result.page); setLoading(false);
    }).catch(() => { if (current) { setError('History could not be read from this browser. Try reloading.'); setLoading(false); } });
    return () => { current = false; };
  }, [page, revision]);
  return <div className={styles.page} aria-busy={loading}><span className={styles.eyebrow}>YOUR ARCHIVE</span><h1>Hand history</h1><StoreFailedNotice />
    {store.failed ? null : error ? <p role="alert">{error}</p> : <>
      {loading && <p role="status">Loading history…</p>}
      {hands && (!total && !loading ? <div className={styles.empty}><p>No completed hands yet.</p><Link to="/play">Play a hand</Link></div> : total > 0 && <>
        <p>Saved in this browser. Export your hands before clearing browser data.</p>
        <div className={styles.list}>{hands.map(h => <article key={h.id} className={styles.handRow}><div><strong><Link to={`/review/${h.id}`}>{h.initialHeroHole.map(cardToText).join(' ')}</Link></strong><span>{new Date(h.completedAt).toLocaleString()} · {h.decisions.length} actions · {h.botVersion}</span></div><strong className={h.heroNet >= 0 ? styles.positive : styles.negative}>{formatAmount(h.heroNet, unit, { signed: true })}</strong></article>)}</div>
        <div className={styles.pagination}><button disabled={loading || page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {Math.ceil(total / HANDS_PAGE_SIZE)}</span><button disabled={loading || (page + 1) * HANDS_PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Next</button></div>
      </>)}
    </>}
  </div>;
}
