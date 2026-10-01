import React from 'react';
import { Link, useParams } from 'react-router';
import { cardToText } from '@poker/contracts';
import type { HandRecord } from '@poker/contracts';
import { potOdds } from '@poker/analysis';
import { GUEST_OWNER, getHand } from '@poker/persistence';
import { useChipUnit } from '../chipUnit';
import { displayAction, formatAmount } from '../format';
import { Cards } from '../components/Cards';
import { reviewView } from '../reviewView';
import styles from '../styles.module.css';

// Review is part of the entry chunk. It must not import @poker/poker (and with it
// poker-engine-ts); that stays in the lazy Play chunk (Req 9.5).
export function Review() {
  const { handId } = useParams();
  const [hand, setHand] = React.useState<HandRecord | null>();
  const [index, setIndex] = React.useState(0);
  const [error, setError] = React.useState('');
  const [outcomeOpen, setOutcomeOpen] = React.useState(false);
  const { unit } = useChipUnit();
  React.useEffect(() => { let live = true; setHand(undefined); setIndex(0); setError(''); setOutcomeOpen(false); void getHand(GUEST_OWNER, handId ?? '').then(record => { if (live) setHand(record ?? null); }).catch(() => { if (live) setError('This hand could not be read. Try reloading.'); }); return () => { live = false; }; }, [handId]);
  if (error) return <div className={styles.page}><p role="alert">{error}</p><Link to="/history">Return to history</Link></div>;
  if (hand === undefined) return <div className={styles.page} role="status">Loading hand…</div>;
  if (!hand) return <div className={styles.page}><h1>Hand unavailable</h1><p>This hand is not saved in this browser.</p><Link to="/history">Return to history</Link></div>;
  if (!hand.decisions[index]) return <div className={styles.page}><h1>No decisions saved</h1><Link to="/history">Return to history</Link></div>;
  // All Review output goes through the pure selector; outcome is null while collapsed.
  const v = reviewView(hand, index, { outcomeOpen });
  const call = v.call;
  const q = potOdds(v.pot, call);
  return <div className={styles.page}><span className={styles.eyebrow}>HAND REVIEW</span><h1>Decision {index + 1} of {hand.decisions.length}</h1><div className={styles.reviewGrid}><section className={styles.reviewTable}><div className={styles.pot}>Pot <strong>{v.pot.toLocaleString()}</strong></div><div className={styles.reviewBoard}><Cards cards={v.board} hiddenCount={5 - v.board.length} /></div><div className={styles.reviewHero}><Cards cards={v.heroHole} /><span>You · {v.heroStack.toLocaleString()} chips</span></div></section><section className={styles.reviewPanel}><h2>{v.actor === 'hero' ? 'Your decision' : 'Bot action'} · {v.street}</h2><p>Chosen: <strong>{displayAction(v.action, v.amount)}</strong></p>{v.actor === 'hero' ? <><dl><div><dt>Pot before acting</dt><dd>{v.pot.toLocaleString()}</dd></div><div><dt>Price to call</dt><dd>{call.toLocaleString()}</dd></div><div><dt>Pot odds</dt><dd>{q === null ? 'No call required' : `${(q * 100).toFixed(1)}%`}</dd></div></dl><p className={styles.notice}>{q === null ? 'You could check without adding chips.' : `Calling ${call.toLocaleString()} would make the pot ${(v.pot + call).toLocaleString()}. The price is ${(q * 100).toFixed(1)}% of that pot.`} This describes the price, not whether calling is the best action. Future bets and the opponent’s range also matter.</p></> : <p>The bot’s private cards are hidden at decision time.</p>}</section></div><div className={styles.pagination}><button disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button><span>{index + 1} / {hand.decisions.length}</span><button disabled={index === hand.decisions.length - 1} onClick={() => setIndex(index + 1)}>Next</button></div><details className={styles.finalLine} key={hand.id} open={outcomeOpen} onToggle={e => setOutcomeOpen(e.currentTarget.open)}><summary>Reveal completed-hand outcome</summary>{v.outcome && <p>Final board: {v.outcome.finalBoard.map(cardToText).join(' ') || 'None'} · Result: {formatAmount(v.outcome.heroNet, unit, { signed: true })}{v.outcome.botHole && <> · Bot at showdown: {v.outcome.botHole.map(cardToText).join(' ')}</>}</p>}</details><Link to="/history">← Back to history</Link></div>;
}
