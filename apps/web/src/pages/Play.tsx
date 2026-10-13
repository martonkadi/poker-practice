import React from 'react';
import { Link } from 'react-router';
import { frame, handIdentity, hole, isSettled, result } from '@poker/poker';
import { useGame } from '../useGame';
import { controlsFor } from '../playMachine';
import { StoreFailedNotice, useStoreStatus } from '../storeStatus';
import { useChipUnit } from '../chipUnit';
import { displayAction, formatAmount } from '../format';
import { decisionKey } from '../decisionKey';
import { Cards } from '../components/Cards';
import styles from '../styles.module.css';

// This module is lazy-loaded from main.tsx so the rules engine (`poker-engine-ts`,
// reached through @poker/poker, useGame and session) stays out of the entry chunk.
export function Play() {
  const game = useGame();
  const store = useStoreStatus();
  const { session, writable, loading, busy, error } = game;
  const [raiseTo, setRaiseTo] = React.useState(200);
  const { unit, setUnit, error: preferenceError } = useChipUnit();
  const current = session ? frame(session.state) : null;
  const legal = current?.actor === 'hero' ? current.legal : null;
  const settled = session ? isSettled(session.state) : false;
  const identity = session ? handIdentity(session.state) : null;
  const enabled = store.writable && writable && !busy && !loading && !game.restoreFailed;
  // Buttons and keyboard shortcuts share one enablement map.
  const controls = controlsFor(legal, !enabled);
  // Reset the typed amount only when the decision changes, not when the same state is re-read.
  const decision = decisionKey(session);
  React.useEffect(() => { if (legal?.raise) setRaiseTo(legal.raise.min); }, [decision]);
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable)) return;
      if (!legal) return;
      if (event.key.toLowerCase() === 'f' && controls.fold) { event.preventDefault(); game.act({ kind: 'fold' }); }
      if (event.key.toLowerCase() === 'c' && controls.checkOrCall) { event.preventDefault(); game.act(legal.check ? { kind: 'check' } : { kind: 'call' }); }
      if (event.key.toLowerCase() === 'r' && controls.raise) { event.preventDefault(); document.getElementById('raise-to')?.focus(); }
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  });
  // Stacks, pot and bets share the History unit.
  const money = (value: number) => formatAmount(value, unit);
  const heroCards = session ? hole(session.state, 'hero') : [];
  const outcome = session && settled ? result(session.state) : null;
  const botCards = session && outcome?.showdown ? hole(session.state, 'bot') : [];
  const allIn = legal?.allInTo;
  const presets = legal?.raise ? [
    { label: 'Min', value: legal.raise.min },
    ...[0.5, 1].map(f => ({ label: f === 0.5 ? '½ pot' : 'Pot', value: Math.max(legal.raise!.min, Math.min(legal.raise!.max, Math.round(current!.commitments.hero + (legal.call ?? 0) + f * (current!.pot + (legal.call ?? 0))))) })),
    { label: 'Max', value: legal.raise.max }
  ] : [];
  return <div className={styles.page}>
    <div className={styles.pageHead}><div><span className={styles.eyebrow}>PRACTICE TABLE</span><h1>Heads-up no-limit</h1><p>Opponent: <span data-testid="opponent-label">standard-v1 · experimental</span></p></div><label><input type="checkbox" checked={unit === 'bb'} disabled={!store.writable} onChange={e => setUnit(e.target.checked ? 'bb' : 'chips')} /> Show bb</label></div>
    <StoreFailedNotice />
    {loading && !store.failed && <p role="status">Loading saved game…</p>}
    {!writable && !loading && <p className={styles.notice}>This session is open in another tab or Web Locks is unavailable. Close the other tab to play here.</p>}
    {preferenceError && !store.failed && <p role="status">{preferenceError}</p>}
    {error && !store.failed && <div className={styles.error} role="alert">{error} {game.canRetryBot && !game.restoreFailed && <button disabled={!store.writable || !writable} onClick={game.retry}>Retry bot</button>}{game.restoreFailed && writable && store.writable && <button onClick={() => { if (window.confirm('Discard the unreadable unfinished hand? Completed history stays saved.')) game.end(); }}>Discard unfinished hand</button>}</div>}
    {!session && !loading && !game.restoreFailed && <div className={styles.empty}><h2>Ready to play?</h2><p>Each hand starts with 100 big blinds. Hands are saved in this browser. The opponent uses an experimental strategy.</p><button className={styles.primary} disabled={!enabled} onClick={game.next}>Deal the first hand</button></div>}
    {session && current && <>
      <div className={styles.table}><div className={styles.playerTop}><div className={styles.avatar}>B</div><div><strong>Practice bot</strong><span>{money(current.stacks.bot)}{identity?.button === 'bot' ? ' · Dealer' : ''}</span><span>In this street: {money(current.commitments.bot)}</span></div><Cards cards={botCards} hiddenCount={botCards.length ? 0 : 2} /></div><div className={styles.boardArea}><div className={styles.pot}>POT <strong>{money(current.pot)}</strong></div><Cards cards={current.board} hiddenCount={Math.max(0, 5 - current.board.length)} /><div className={styles.street}>{current.street.toUpperCase()}</div></div><div className={styles.playerBottom}><div className={styles.avatar}>Y</div><div><strong>You</strong><span>{money(current.stacks.hero)}{identity?.button === 'hero' ? ' · Dealer' : ''}</span><span>In this street: {money(current.commitments.hero)}</span></div><Cards cards={heroCards} /></div></div>
      <div className={styles.belowTable}><section className={styles.controlPanel}><h2>{settled ? 'Hand complete' : current.actor === 'hero' ? 'Your decision' : 'Bot is thinking…'}</h2>
        {settled ? <><p className={styles.result}>{formatAmount(outcome!.heroNet, unit, { signed: true })} this hand</p><p>{outcome!.showdown ? outcome!.heroNet === 0 ? 'Showdown · Split pot' : outcome!.heroNet > 0 ? 'Showdown · You win' : 'Showdown · Bot wins' : 'Hand ended with a fold'}</p><div className={styles.actions}><button className={styles.primary} disabled={!enabled} onClick={game.next}>Next hand</button><Link className={styles.secondary} to={`/review/${identity!.id}`}>Review hand</Link></div></>
          : current.actor === 'hero' && legal ? <><div className={styles.actions}><button disabled={!controls.fold} onClick={() => game.act({ kind: 'fold' })}>Fold <kbd>F</kbd></button><button disabled={!controls.checkOrCall} onClick={() => game.act(legal.check ? { kind: 'check' } : { kind: 'call' })}>{legal.check ? 'Check' : `Call ${money(legal.call ?? 0)}`} <kbd>C</kbd></button></div>{legal.raise && <><div className={styles.betRow}><label htmlFor="raise-to">Bet / raise to</label><input id="raise-to" type="number" min={legal.raise.min} max={legal.raise.max} step="1" value={raiseTo} onChange={e => setRaiseTo(Number(e.target.value))} /><button className={styles.primary} disabled={!controls.raise || !Number.isSafeInteger(raiseTo) || raiseTo < legal.raise.min || raiseTo > legal.raise.max} onClick={() => game.act({ kind: 'raiseTo', amount: raiseTo })}>Raise</button></div><div className={styles.presets}>{presets.map(preset => <button disabled={!controls.raise} key={preset.label} onClick={() => setRaiseTo(preset.value)}>{preset.label} · {money(preset.value)}</button>)}</div></>}{allIn !== null && allIn !== undefined && <button className={styles.allIn} disabled={!controls.allIn} onClick={() => game.act({ kind: 'raiseTo', amount: allIn })}>All-in · {money(allIn)}</button>}</> : <p role="status">Choosing an action from the bot’s cards and public information.</p>}
      </section><section className={styles.historyPanel}><h2>Actions</h2><ol>{session.decisions.map((d, i) => <li key={i}><span>{d.frame.actor === 'hero' ? 'You' : 'Bot'} · {d.frame.street}</span><strong>{displayAction(d.action, d.amount)}</strong></li>)}</ol>{!session.decisions.length && <p>No actions yet.</p>}</section></div>
      <div className={styles.subtleActions}><span>Saved in this browser · Export from Settings</span><button disabled={!enabled} onClick={() => { if (settled || window.confirm('End this session and discard the unfinished hand? Completed hands stay saved.')) game.end(); }}>End session</button></div>
    </>}
  </div>;
}

export default Play;
