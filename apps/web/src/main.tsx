import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useNavigate, useParams } from 'react-router';
import { cardToText } from '@poker/contracts';
import type { Action, Card, HandRecord } from '@poker/contracts';
import { potOdds } from '@poker/analysis';
import { frame, handIdentity, hole, isSettled, result } from '@poker/poker';
import { GUEST_OWNER, deleteLocal, exportHands, getHand, getPreference, listHands, putPreference } from '@poker/persistence';
import { useGame } from './useGame';
import styles from './styles.module.css';

function displayAction(action: Action, amount: number): string {
  if (action.kind === 'raiseTo') return `Bet / raise to ${action.amount.toLocaleString()}`;
  if (action.kind === 'call') return `Call ${amount.toLocaleString()}`;
  return action.kind[0]!.toUpperCase() + action.kind.slice(1);
}
function CardFace({ card, hidden = false }: { card?: Card; hidden?: boolean }) {
  const text = card === undefined ? '' : cardToText(card);
  const suit = text[1];
  const symbol = suit === 'h' ? '♥' : suit === 'd' ? '♦' : suit === 's' ? '♠' : '♣';
  return <span className={`${styles.card} ${hidden ? styles.cardBack : ''} ${suit === 'h' || suit === 'd' ? styles.red : ''}`} aria-label={hidden ? 'Hidden card' : `${text[0]} ${symbol}`}>{hidden ? '✦' : <>{text[0]}<small>{symbol}</small></>}</span>;
}
function Cards({ cards, hiddenCount = 0 }: { cards: readonly Card[]; hiddenCount?: number }) {
  return <span className={styles.cards}>{cards.map((c, i) => <CardFace card={c} key={`${c}-${i}`} />)}{Array.from({ length: hiddenCount }, (_, i) => <CardFace hidden key={`h-${i}`} />)}</span>;
}
function Shell({ children }: { children: React.ReactNode }) {
  return <div className={styles.shell}><header className={styles.header}><Link className={styles.brand} to="/">♠ Poker Practice</Link><nav aria-label="Main navigation"><Link to="/play">Play</Link><Link to="/history">History</Link><Link to="/settings">Settings</Link><Link to="/about">About</Link></nav></header><main>{children}</main><footer>Practice chips · Experimental opponent · Saved in this browser</footer></div>;
}
function Home() {
  return <section className={styles.hero}><div className={styles.eyebrow}>HEADS-UP HOLD’EM PRACTICE</div><h1>Play the hand. Study the decision.</h1><p>Play complete no-limit hands against an experimental opponent. Revisit your actions and the price of a call. Free practice chips, no account needed.</p><div className={styles.actions}><Link className={styles.primary} to="/play">Start playing</Link><Link className={styles.secondary} to="/about">How it works</Link></div><div className={styles.featureGrid}><article><strong>100bb</strong><span>Fresh stacks each hand</span></article><article><strong>Your pace</strong><span>Play, pause and review</span></article><article><strong>Local saves</strong><span>Hands stay in this browser</span></article></div></section>;
}
function Play() {
  const game = useGame();
  const { session, writable, loading, busy, error } = game;
  const [raiseTo, setRaiseTo] = React.useState(200);
  const [chipsAsBb, setChipsAsBb] = React.useState(false);
  const [preferenceError, setPreferenceError] = React.useState('');
  const current = session ? frame(session.state) : null;
  const legal = current?.actor === 'hero' ? current.legal : null;
  const settled = session ? isSettled(session.state) : false;
  const identity = session ? handIdentity(session.state) : null;
  const enabled = writable && !busy && !loading && !game.restoreFailed;
  React.useEffect(() => { void getPreference(GUEST_OWNER).then(p => setChipsAsBb(p.chipsAsBb)).catch(() => setPreferenceError('Display preference could not be loaded.')); }, []);
  React.useEffect(() => { if (legal?.raise) setRaiseTo(legal.raise.min); }, [session]);
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable)) return;
      if (!legal || !enabled) return;
      if (event.key.toLowerCase() === 'f' && legal.fold) { event.preventDefault(); game.act({ kind: 'fold' }); }
      if (event.key.toLowerCase() === 'c') { event.preventDefault(); if (legal.check) game.act({ kind: 'check' }); else if (legal.call !== null) game.act({ kind: 'call' }); }
      if (event.key.toLowerCase() === 'r') document.getElementById('raise-to')?.focus();
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [session, enabled]);
  const money = (value: number) => chipsAsBb ? `${(value / 100).toFixed(value % 100 ? 1 : 0)} bb` : value.toLocaleString();
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
    <div className={styles.pageHead}><div><span className={styles.eyebrow}>PRACTICE TABLE</span><h1>Heads-up no-limit</h1></div><label><input type="checkbox" checked={chipsAsBb} onChange={e => { const value = e.target.checked; setChipsAsBb(value); void putPreference({ owner: GUEST_OWNER, chipsAsBb: value, animationSpeed: 'none' }).catch(() => setPreferenceError('Display preference could not be saved.')); }} /> Show bb</label></div>
    {loading && <p role="status">Loading saved game…</p>}
    {!writable && !loading && <p className={styles.notice}>This session is open in another tab or Web Locks is unavailable. Close the other tab to play here.</p>}
    {preferenceError && <p role="status">{preferenceError}</p>}
    {error && <div className={styles.error} role="alert">{error} {current?.actor === 'bot' && !game.restoreFailed && <button onClick={game.retry}>Retry bot</button>}{game.restoreFailed && writable && <button onClick={() => { if (window.confirm('Discard the unreadable unfinished hand? Completed history stays saved.')) game.end(); }}>Discard unfinished hand</button>}</div>}
    {!session && !loading && !game.restoreFailed && <div className={styles.empty}><h2>Ready to play?</h2><p>Each hand starts with 100 big blinds. Hands are saved in this browser. The opponent uses an experimental strategy.</p><button className={styles.primary} disabled={!enabled} onClick={game.next}>Deal the first hand</button></div>}
    {session && current && <>
      <div className={styles.table}><div className={styles.playerTop}><div className={styles.avatar}>B</div><div><strong>Practice bot</strong><span>{money(current.stacks.bot)}{identity?.button === 'bot' ? ' · Dealer' : ''}</span><span>In this street: {money(current.commitments.bot)}</span></div><Cards cards={botCards} hiddenCount={botCards.length ? 0 : 2} /></div><div className={styles.boardArea}><div className={styles.pot}>POT <strong>{money(current.pot)}</strong></div><Cards cards={current.board} hiddenCount={Math.max(0, 5 - current.board.length)} /><div className={styles.street}>{current.street.toUpperCase()}</div></div><div className={styles.playerBottom}><div className={styles.avatar}>Y</div><div><strong>You</strong><span>{money(current.stacks.hero)}{identity?.button === 'hero' ? ' · Dealer' : ''}</span><span>In this street: {money(current.commitments.hero)}</span></div><Cards cards={heroCards} /></div></div>
      <div className={styles.belowTable}><section className={styles.controlPanel}><h2>{settled ? 'Hand complete' : current.actor === 'hero' ? 'Your decision' : 'Bot is thinking…'}</h2>
        {settled ? <><p className={styles.result}>{outcome!.heroNet >= 0 ? '+' : ''}{money(outcome!.heroNet)} this hand</p><p>{outcome!.showdown ? outcome!.heroNet === 0 ? 'Showdown · Split pot' : outcome!.heroNet > 0 ? 'Showdown · You win' : 'Showdown · Bot wins' : 'Hand ended with a fold'}</p><div className={styles.actions}><button className={styles.primary} disabled={!enabled} onClick={game.next}>Next hand</button><Link className={styles.secondary} to={`/review/${identity!.id}`}>Review hand</Link></div></>
          : current.actor === 'hero' && legal ? <><div className={styles.actions}><button disabled={!legal.fold || !enabled} onClick={() => game.act({ kind: 'fold' })}>Fold <kbd>F</kbd></button><button disabled={!enabled || (!legal.check && legal.call === null)} onClick={() => game.act(legal.check ? { kind: 'check' } : { kind: 'call' })}>{legal.check ? 'Check' : `Call ${money(legal.call ?? 0)}`} <kbd>C</kbd></button></div>{legal.raise && <><div className={styles.betRow}><label htmlFor="raise-to">Bet / raise to</label><input id="raise-to" type="number" min={legal.raise.min} max={legal.raise.max} step="1" value={raiseTo} onChange={e => setRaiseTo(Number(e.target.value))} /><button className={styles.primary} disabled={!enabled || !Number.isSafeInteger(raiseTo) || raiseTo < legal.raise.min || raiseTo > legal.raise.max} onClick={() => game.act({ kind: 'raiseTo', amount: raiseTo })}>Raise</button></div><div className={styles.presets}>{presets.map(preset => <button disabled={!enabled} key={preset.label} onClick={() => setRaiseTo(preset.value)}>{preset.label} · {money(preset.value)}</button>)}</div></>}{allIn !== null && allIn !== undefined && <button className={styles.allIn} disabled={!enabled} onClick={() => game.act({ kind: 'raiseTo', amount: allIn })}>All-in · {money(allIn)}</button>}</> : <p role="status">Choosing an action from the bot’s cards and public information.</p>}
      </section><section className={styles.historyPanel}><h2>Actions</h2><ol>{session.decisions.map((d, i) => <li key={i}><span>{d.frame.actor === 'hero' ? 'You' : 'Bot'} · {d.frame.street}</span><strong>{displayAction(d.action, d.amount)}</strong></li>)}</ol>{!session.decisions.length && <p>No actions yet.</p>}</section></div>
      <div className={styles.subtleActions}><span>Saved in this browser · Export from Settings</span><button disabled={!enabled} onClick={() => { if (settled || window.confirm('End this session and discard the unfinished hand? Completed hands stay saved.')) game.end(); }}>End session</button></div>
    </>}
  </div>;
}
function History() {
  const [hands, setHands] = React.useState<HandRecord[] | null>(null);
  const [error, setError] = React.useState('');
  const [page, setPage] = React.useState(0);
  React.useEffect(() => { void listHands(GUEST_OWNER).then(setHands).catch(() => setError('History could not be read from this browser. Try reloading.')); }, []);
  return <div className={styles.page}><span className={styles.eyebrow}>YOUR ARCHIVE</span><h1>Hand history</h1>{error ? <p role="alert">{error}</p> : !hands ? <p role="status">Loading history…</p> : !hands.length ? <div className={styles.empty}><p>No completed hands yet.</p><Link to="/play">Play a hand</Link></div> : <><p>Saved in this browser. Export your hands before clearing browser data.</p><div className={styles.list}>{hands.slice(page * 50, (page + 1) * 50).map(h => <article key={h.id} className={styles.handRow}><div><strong><Link to={`/review/${h.id}`}>{h.initialHeroHole.map(cardToText).join(' ')}</Link></strong><span>{new Date(h.completedAt).toLocaleString()} · {h.decisions.length} actions · {h.botVersion}</span></div><strong className={h.heroNet >= 0 ? styles.positive : styles.negative}>{h.heroNet >= 0 ? '+' : ''}{(h.heroNet / 100).toFixed(1)} bb</strong></article>)}</div><div className={styles.pagination}><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {Math.ceil(hands.length / 50)}</span><button disabled={(page + 1) * 50 >= hands.length} onClick={() => setPage(page + 1)}>Next</button></div></>}</div>;
}
function Review() {
  const { handId } = useParams();
  const [hand, setHand] = React.useState<HandRecord | null>();
  const [index, setIndex] = React.useState(0);
  const [error, setError] = React.useState('');
  React.useEffect(() => { let live = true; setHand(undefined); setIndex(0); setError(''); void getHand(GUEST_OWNER, handId ?? '').then(record => { if (live) setHand(record ?? null); }).catch(() => { if (live) setError('This hand could not be read. Try reloading.'); }); return () => { live = false; }; }, [handId]);
  if (error) return <div className={styles.page}><p role="alert">{error}</p><Link to="/history">Return to history</Link></div>;
  if (hand === undefined) return <div className={styles.page} role="status">Loading hand…</div>;
  if (!hand) return <div className={styles.page}><h1>Hand unavailable</h1><p>This hand is not saved in this browser.</p><Link to="/history">Return to history</Link></div>;
  const decision = hand.decisions[index];
  if (!decision) return <div className={styles.page}><h1>No decisions saved</h1><Link to="/history">Return to history</Link></div>;
  const f = decision.frame;
  const call = f.legal?.call ?? 0;
  const q = potOdds(f.pot, call);
  return <div className={styles.page}><span className={styles.eyebrow}>HAND REVIEW</span><h1>Decision {index + 1} of {hand.decisions.length}</h1><div className={styles.reviewGrid}><section className={styles.reviewTable}><div className={styles.pot}>Pot <strong>{f.pot.toLocaleString()}</strong></div><div className={styles.reviewBoard}><Cards cards={f.board} hiddenCount={5 - f.board.length} /></div><div className={styles.reviewHero}><Cards cards={decision.heroHole} /><span>You · {f.stacks.hero.toLocaleString()} chips</span></div></section><section className={styles.reviewPanel}><h2>{f.actor === 'hero' ? 'Your decision' : 'Bot action'} · {f.street}</h2><p>Chosen: <strong>{displayAction(decision.action, decision.amount)}</strong></p>{f.actor === 'hero' ? <><dl><div><dt>Pot before acting</dt><dd>{f.pot.toLocaleString()}</dd></div><div><dt>Price to call</dt><dd>{call.toLocaleString()}</dd></div><div><dt>Pot odds</dt><dd>{q === null ? 'No call required' : `${(q * 100).toFixed(1)}%`}</dd></div></dl><p className={styles.notice}>{q === null ? 'You could check without adding chips.' : `Calling ${call.toLocaleString()} would make the pot ${(f.pot + call).toLocaleString()}. The price is ${(q * 100).toFixed(1)}% of that pot.`} This describes the price, not whether calling is the best action. Future bets and the opponent’s range also matter.</p></> : <p>The bot’s private cards are hidden at decision time.</p>}</section></div><div className={styles.pagination}><button disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button><span>{index + 1} / {hand.decisions.length}</span><button disabled={index === hand.decisions.length - 1} onClick={() => setIndex(index + 1)}>Next</button></div><details className={styles.finalLine} key={hand.id}><summary>Reveal completed-hand outcome</summary><p>Final board: {hand.finalBoard.map(cardToText).join(' ') || 'None'} · Result: {hand.heroNet >= 0 ? '+' : ''}{hand.heroNet} chips{hand.botHole && <> · Bot at showdown: {hand.botHole.map(cardToText).join(' ')}</>}</p></details><Link to="/history">← Back to history</Link></div>;
}
function Settings() {
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const navigate = useNavigate();
  async function download() {
    try { const text = await exportHands(GUEST_OWNER); const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `poker-practice-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch { setMessage('Export failed. Your saved data has not been changed.'); }
  }
  async function clear() {
    if (!window.confirm('Delete all guest poker data saved in this browser? Export your hands first.')) return;
    setBusy(true);
    try {
      if (!navigator.locks) throw new Error('Safe deletion requires a browser with Web Locks.');
      await navigator.locks.request(`poker-session-${GUEST_OWNER}`, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('Close the practice table in other tabs before deleting data.');
        await deleteLocal(GUEST_OWNER); navigate('/');
      });
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Data could not be deleted.'); }
    finally { setBusy(false); }
  }
  return <div className={styles.page}><span className={styles.eyebrow}>YOUR DATA</span><h1>Settings</h1><section className={styles.settingsCard}><h2>Saved in this browser</h2><p>There is no account or cloud backup in this MVP. Clearing browser data or using a different device will not bring your hands with you. Export a JSON archive to keep a copy. Archive import is not available in this MVP.</p><div className={styles.actions}><button onClick={() => void download()}>Export JSON</button></div><button className={styles.danger} disabled={busy} onClick={() => void clear()}>Delete local data</button></section>{message && <p role="status">{message}</p>}</div>;
}
function About() {
  return <div className={styles.page}><span className={styles.eyebrow}>HOW IT WORKS</span><h1>Practice with clear limits</h1><div className={styles.prose}><p>Play heads-up no-limit Hold’em with 50/100 blinds, fresh 10,000-chip stacks each hand, and an alternating dealer button. Practice chips have no cash value.</p><p>The practice bot estimates equity against uniformly sampled legal hands, then applies experimental rules. It cannot see your private cards or future board cards. It is not a solved GTO opponent and its strength has not been established.</p><p>Review shows the cards and pot visible at each saved decision, your action and exact pot odds. It does not grade decisions or calculate EV loss.</p><p>Your hands stay in this browser. No account, cloud sync or analytics is used by the app. The hosting provider receives ordinary web requests. Export your data before clearing browser storage.</p><p>Build commit: {import.meta.env.VITE_GIT_COMMIT || 'local development'} · Opponent: standard-v1 · Guest MVP.</p><p><a href="/third-party-notices.txt">Third-party notices</a> · <a href="/license.txt">First-party license</a></p></div></div>;
}
function App() {
  return <BrowserRouter><Shell><Routes><Route path="/" element={<Home />} /><Route path="/play" element={<Play />} /><Route path="/history" element={<History />} /><Route path="/review/:handId" element={<Review />} /><Route path="/settings" element={<Settings />} /><Route path="/about" element={<About />} /><Route path="*" element={<div className={styles.page}><h1>Page not found</h1><Link to="/">Go home</Link></div>} /></Routes></Shell></BrowserRouter>;
}
createRoot(document.getElementById('root')!).render(<App />);
