import React from 'react';
import { Link } from 'react-router';
import { cardToText } from '@poker/contracts';
import type { HandRecord } from '@poker/contracts';
import { GUEST_OWNER, listHands } from '@poker/persistence';
import { StoreFailedNotice, useStoreStatus } from '../storeStatus';
import { useChipUnit } from '../chipUnit';
import { formatAmount } from '../format';
import styles from '../styles.module.css';

export function History() {
  const [hands, setHands] = React.useState<HandRecord[] | null>(null);
  const [error, setError] = React.useState('');
  const [page, setPage] = React.useState(0);
  const store = useStoreStatus();
  const { unit } = useChipUnit();
  React.useEffect(() => { void listHands(GUEST_OWNER).then(setHands).catch(() => setError('History could not be read from this browser. Try reloading.')); }, []);
  return <div className={styles.page}><span className={styles.eyebrow}>YOUR ARCHIVE</span><h1>Hand history</h1><StoreFailedNotice />{store.failed ? null : error ? <p role="alert">{error}</p> : !hands ? <p role="status">Loading history…</p> : !hands.length ? <div className={styles.empty}><p>No completed hands yet.</p><Link to="/play">Play a hand</Link></div> : <><p>Saved in this browser. Export your hands before clearing browser data.</p><div className={styles.list}>{hands.slice(page * 50, (page + 1) * 50).map(h => <article key={h.id} className={styles.handRow}><div><strong><Link to={`/review/${h.id}`}>{h.initialHeroHole.map(cardToText).join(' ')}</Link></strong><span>{new Date(h.completedAt).toLocaleString()} · {h.decisions.length} actions · {h.botVersion}</span></div><strong className={h.heroNet >= 0 ? styles.positive : styles.negative}>{formatAmount(h.heroNet, unit, { signed: true })}</strong></article>)}</div><div className={styles.pagination}><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {Math.ceil(hands.length / 50)}</span><button disabled={(page + 1) * 50 >= hands.length} onClick={() => setPage(page + 1)}>Next</button></div></>}</div>;
}
