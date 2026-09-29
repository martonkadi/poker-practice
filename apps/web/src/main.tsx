import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes, useNavigate, useParams } from 'react-router';
import { cardToText } from '@poker/contracts';
import type { Action, Actor, Card, Difficulty, HandRecord, PlayerObservation } from '@poker/contracts';
import { chooseAction } from '@poker/bots';
import { potOdds, scoreSeven } from '@poker/analysis';
import type { EquityEstimate } from '@poker/analysis';
import { applyAction, board, createHand, frame, hole, isSettled, observe, restoreState, result } from '@poker/poker';
import { GUEST_OWNER, abandonActive, deleteLocal, exportHands, getHand, getPreference, importHands, listHands, loadActive, pendingSync, putPreference, saveActive, saveCompleted, setBookmark } from '@poker/persistence';
import type { ActiveSession } from '@poker/persistence';
import { requestBot, requestEquity } from './workerClient';
import { cloud, deleteAccount, signInWithGoogle, synchronize } from './cloud';
import type { User } from '@supabase/supabase-js';
import styles from './styles.module.css';

const SUPABASE_CONFIGURED = Boolean(cloud);
const AuthContext = React.createContext<{ owner: string; user: User | null; ready: boolean }>({ owner: GUEST_OWNER, user: null, ready: false });
function useAuth() { return React.useContext(AuthContext); }
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [ready, setReady] = React.useState(!cloud);
  React.useEffect(() => {
    if (!cloud) return;
    let live = true;
    void cloud.auth.getUser().then(({ data }) => { if (live) { setUser(data.user); setReady(true); } });
    const { data: listener } = cloud.auth.onAuthStateChange((_event, session) => { if (live) { setUser(session?.user ?? null); setReady(true); } });
    return () => { live = false; listener.subscription.unsubscribe(); };
  }, []);
  return <AuthContext.Provider value={{ owner: user?.id ?? GUEST_OWNER, user, ready }}>{children}</AuthContext.Provider>;
}
function displayAction(action: Action, amount: number): string {
  if (action.kind === 'raiseTo') return `Raise to ${action.amount.toLocaleString()}`;
  if (action.kind === 'call') return `Call ${amount.toLocaleString()}`;
  return action.kind[0]!.toUpperCase() + action.kind.slice(1);
}
const handNames = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
function showdownDescription(state: ActiveSession['state']): string | null {
  const cards = board(state);
  if (!isSettled(state) || cards.length !== 5 || !result(state).showdown) return null;
  const hero = scoreSeven([...hole(state, 'hero'), ...cards]);
  const bot = scoreSeven([...hole(state, 'bot'), ...cards]);
  const best = Math.max(hero, bot);
  return `${hero === bot ? 'Split pot' : hero > bot ? 'You win' : 'Bot wins'} · ${handNames[Math.floor(best / 15 ** 5)] ?? 'Best hand'}`;
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
  const { user } = useAuth();
  return <div className={styles.shell}><header className={styles.header}><Link className={styles.brand} to="/">♠ Poker Practice</Link><nav aria-label="Main navigation"><Link to="/play">Play</Link><Link to="/history">History</Link><Link to="/progress">Progress</Link><Link to="/settings">Settings{user ? ' · Account' : ''}</Link><Link to="/about">About</Link></nav></header><main>{children}</main><footer>Practice chips · Experimental opponents · No GTO accuracy claims</footer></div>;
}
function Home() {
  const { user } = useAuth();
  return <section className={styles.hero}><div className={styles.eyebrow}>HEADS-UP HOLD’EM PRACTICE</div><h1>Play the hand. Study the decision.</h1><p>Practice complete no-limit hands against an experimental bot. Review each choice with pot odds and sampled equity. Play free with practice chips.</p><div className={styles.actions}><Link className={styles.primary} to="/play">Start playing</Link>{cloud && !user && <button className={styles.secondary} onClick={() => void signInWithGoogle()}>Sign in with Google</button>}<Link className={styles.secondary} to="/about">How the bot works</Link></div><div className={styles.featureGrid}><article><strong>100bb</strong><span>Fresh stacks each hand</span></article><article><strong>2 modes</strong><span>Easy and Standard experimental policies</span></article><article><strong>Local first</strong><span>Hands saved on this device</span></article></div></section>;
}
function useSessionLock(owner: string): boolean {
  const [writable, setWritable] = React.useState(false);
  React.useEffect(() => {
    if (!navigator.locks) { setWritable(false); return; }
    let release: (() => void) | undefined;
    let cancelled = false;
    const controller = new AbortController();
    void navigator.locks.request(`poker-session-${owner}`, { signal: controller.signal }, async () => {
      if (cancelled) return;
      setWritable(true);
      await new Promise<void>(resolve => { release = resolve; });
    }).catch(() => {});
    return () => { cancelled = true; controller.abort(); release?.(); setWritable(false); };
  }, [owner]);
  return writable;
}
function Play() {
  const { owner, ready } = useAuth();
  const [session, setSession] = React.useState<ActiveSession | null>(null);
  const sessionRef = React.useRef<ActiveSession | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [difficulty, setDifficulty] = React.useState<Difficulty>('standard');
  const [raiseTo, setRaiseTo] = React.useState(200);
  const [chipsAsBb, setChipsAsBb] = React.useState(false);
  const [animationSpeed, setAnimationSpeed] = React.useState<'normal' | 'fast' | 'none'>('normal');
  const [syncStatus, setSyncStatus] = React.useState('');
  const writable = useSessionLock(owner);
  React.useEffect(() => { if (!ready) return; let live = true; sessionRef.current = null; setSession(null); setLoading(true); void Promise.all([loadActive(owner), getPreference(owner)]).then(([saved, pref]) => {
    if (!live) return;
    if (saved) { try { const restored = { ...saved, state: restoreState(saved.state) }; sessionRef.current = restored; setSession(restored); setDifficulty(restored.difficulty); } catch { setError('The saved hand could not be restored. Export your history before starting over.'); } }
    setChipsAsBb(pref.chipsAsBb); setAnimationSpeed(pref.animationSpeed); setLoading(false);
  }); return () => { live = false; }; }, [owner, ready]);
  React.useEffect(() => {
    if (owner === GUEST_OWNER || !ready) return;
    const sync = () => void synchronize(owner).then(() => setSyncStatus('Cloud sync up to date')).catch(() => setSyncStatus('Saved on this device; cloud sync unavailable.'));
    sync(); window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, [owner, ready]);
  const current = session ? frame(session.state) : null;
  const legal = current?.actor === 'hero' ? current.legal : null;
  React.useEffect(() => { if (legal?.raise) setRaiseTo(legal.raise.min); }, [session?.state.activeSnapshot.index]);
  const money = (value: number) => chipsAsBb ? `${(value / 100).toFixed(value % 100 ? 1 : 0)} bb` : value.toLocaleString();

  async function startNew(nextSequence = 0, existingId: string = crypto.randomUUID(), selected = difficulty) {
    if (!writable) return;
    setBusy(true); setError('');
    try {
      const state = await createHand(nextSequence % 2 === 0 ? 'hero' : 'bot');
      const next: ActiveSession = { id: existingId, owner, state, difficulty: selected, nextSequence, decisions: [], startedAt: new Date().toISOString() };
      await saveActive(next); sessionRef.current = next; setSession(next);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start a hand'); }
    finally { setBusy(false); }
  }
  async function commit(action: Action, expected?: ActiveSession) {
    const active = sessionRef.current;
    if (!writable || !active || busy || (expected && active.state.events.length !== expected.state.events.length)) return;
    const before = frame(active.state);
    if (!before.actor || isSettled(active.state)) return;
    setBusy(true); setError('');
    try {
      const state = await applyAction(active.state, before.actor, action);
      const amount = state.events.at(-1)?.event.contribution ?? 0;
      const decisions = [...active.decisions, { frame: before, action, amount, heroHole: hole(active.state, 'hero') }];
      const settled = isSettled(state);
      const next: ActiveSession = { ...active, state, decisions, recordedHandId: settled ? state.activeSnapshot.hand.id : undefined };
      if (settled) {
        const outcome = result(state);
        const record: HandRecord = {
          schemaVersion: 1, engineVersion: 'poker-engine-ts@0.1.3+blind-patch-v1',
          botVersion: active.difficulty === 'easy' ? 'easy-v1' : 'standard-v1', id: state.activeSnapshot.hand.id,
          sessionId: active.id, sessionStartedAt: active.startedAt, sequence: active.nextSequence, completedAt: new Date().toISOString(),
          button: state.activeSnapshot.seating.dealerButton === 0 ? 'hero' : 'bot', difficulty: active.difficulty,
          initialHeroHole: hole(state, 'hero'), botHole: outcome.showdown ? hole(state, 'bot') : null,
          finalBoard: board(state), decisions, heroNet: outcome.heroNet,
          reachedShowdown: outcome.showdown, heroWonShowdown: outcome.heroWonShowdown, bookmarked: false
        };
        await saveCompleted(owner, record, next);
        if (owner !== GUEST_OWNER) void synchronize(owner).then(() => setSyncStatus('Cloud sync up to date')).catch(() => setSyncStatus('Saved on this device; cloud sync unavailable.'));
      } else await saveActive(next);
      sessionRef.current = next; setSession(next);
    } catch (e) { setError(e instanceof Error ? e.message : 'Action failed'); }
    finally { setBusy(false); }
  }
  React.useEffect(() => {
    if (!session || !writable || busy || current?.actor !== 'bot' || isSettled(session.state) || error) return;
    const expected = session;
    let cancelled = false;
    setBusy(true);
    void requestBot(observe(session.state, 'bot'), session.difficulty).then(async decision => {
      if (cancelled || sessionRef.current?.state.events.length !== expected.state.events.length || sessionRef.current?.state.activeSnapshot.hand.id !== expected.state.activeSnapshot.hand.id) return;
      setBusy(false);
      await commit(decision.action, expected);
    }).catch(e => { if (!cancelled) { setBusy(false); setError(e instanceof Error ? e.message : 'Bot failed'); } });
    return () => { cancelled = true; };
  }, [session?.state.activeSnapshot.index, session?.state.activeSnapshot.hand.id, writable, error]);
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable)) return;
      if (!legal || busy || !writable) return;
      if (event.key.toLowerCase() === 'f' && legal.fold) void commit({ kind: 'fold' });
      if (event.key.toLowerCase() === 'c') { if (legal.check) void commit({ kind: 'check' }); else if (legal.call !== null) void commit({ kind: 'call' }); }
      if (event.key.toLowerCase() === 'r') document.getElementById('raise-to')?.focus();
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [legal, busy, writable]);
  const heroCards = session ? hole(session.state, 'hero') : [];
  const botCards = session && isSettled(session.state) && session.state.activeSnapshot.hand.showdown ? hole(session.state, 'bot') : [];
  const allIn = legal?.allInTo;
  const presetValues = legal?.raise
    ? [legal.raise.min, ...[0.5, 2 / 3, 1].map(f => Math.round(current!.commitments.hero + (legal.call ?? 0) + f * (current!.pot + (legal.call ?? 0)))), legal.raise.max]
    : [];
  const presets = legal?.raise ? Array.from(new Set(presetValues.map(value => Math.max(legal.raise!.min, Math.min(legal.raise!.max, value))))) : [];
  return <div className={styles.page}><div className={styles.pageHead}><div><span className={styles.eyebrow}>PRACTICE TABLE</span><h1>Heads-up no-limit</h1></div><div className={styles.toolbar}><label>Opponent <select value={session ? session.difficulty : difficulty} disabled={!!session && !isSettled(session.state)} onChange={e => setDifficulty(e.target.value as Difficulty)}><option value="easy">Easy experimental</option><option value="standard">Standard experimental</option></select></label><label><input type="checkbox" checked={chipsAsBb} onChange={e => { const v = e.target.checked; setChipsAsBb(v); void putPreference({ owner, chipsAsBb: v, animationSpeed }); }} /> Show bb</label></div></div>
    {loading && <p role="status">Loading saved game…</p>}
    {syncStatus && owner !== GUEST_OWNER && <p role="status">{syncStatus}</p>}
    {!writable && !loading && <p className={styles.notice}>This session is open in another tab or Web Locks is unavailable. Close the other tab to play here.</p>}
    {error && <div className={styles.error} role="alert">{error} {current?.actor === 'bot' && <button onClick={() => setError('')}>Retry bot</button>}</div>}
    {!session && !loading && <div className={styles.empty}><h2>Ready to play?</h2><p>Each hand starts with 100 big blinds. Results are saved on this device. The relative strength of the experimental modes has not been established.</p><button className={styles.primary} disabled={!writable || busy} onClick={() => void startNew()}>Deal the first hand</button></div>}
    {session && current && <><div className={styles.table} data-speed={animationSpeed}><div className={styles.playerTop}><div className={styles.avatar}>B</div><div><strong>{session.difficulty === 'easy' ? 'Easy bot' : 'Standard bot'}</strong><span>{money(current.stacks.bot)}{session.state.activeSnapshot.seating.dealerButton === 1 ? ' · Dealer' : ''}</span></div><Cards cards={botCards} hiddenCount={botCards.length ? 0 : 2} /></div><div className={styles.boardArea}><div className={styles.pot}>POT <strong>{money(current.pot)}</strong></div><Cards cards={current.board} hiddenCount={Math.max(0, 5 - current.board.length)} /><div className={styles.street}>{current.street.toUpperCase()}</div></div><div className={styles.playerBottom}><div className={styles.avatar}>Y</div><div><strong>You</strong><span>{money(current.stacks.hero)}{session.state.activeSnapshot.seating.dealerButton === 0 ? ' · Dealer' : ''}</span></div><Cards cards={heroCards} /></div></div>
      <div className={styles.belowTable}><section className={styles.controlPanel}><h2>{isSettled(session.state) ? 'Hand complete' : current.actor === 'hero' ? 'Your decision' : 'Bot is thinking…'}</h2>{isSettled(session.state) ? <><p className={styles.result}>{result(session.state).heroNet >= 0 ? '+' : ''}{money(result(session.state).heroNet)} this hand</p>{showdownDescription(session.state) && <p>{showdownDescription(session.state)}</p>}<div className={styles.actions}><button className={styles.primary} disabled={!writable || busy} onClick={() => void startNew(session.nextSequence + 1, session.id, difficulty)}>Next hand</button><Link className={styles.secondary} to={`/review/${session.state.activeSnapshot.hand.id}`}>Review hand</Link></div></> : current.actor === 'hero' && legal ? <><div className={styles.actions}><button disabled={!legal.fold || busy || !writable} onClick={() => void commit({ kind: 'fold' })}>Fold <kbd>F</kbd></button><button disabled={!writable || busy || (!legal.check && legal.call === null)} onClick={() => void commit(legal.check ? { kind: 'check' } : { kind: 'call' })}>{legal.check ? 'Check' : `Call ${money(legal.call ?? 0)}`} <kbd>C</kbd></button></div>{legal.raise && <><div className={styles.betRow}><label htmlFor="raise-to">Raise to</label><input id="raise-to" type="number" min={legal.raise.min} max={legal.raise.max} step="1" value={raiseTo} onChange={e => setRaiseTo(Number(e.target.value))} /><button className={styles.primary} disabled={!writable || busy || !Number.isSafeInteger(raiseTo) || raiseTo < legal.raise.min || raiseTo > legal.raise.max} onClick={() => void commit({ kind: 'raiseTo', amount: raiseTo })}>Raise</button></div><div className={styles.presets}>{presets.map((value, i) => <button key={value} onClick={() => setRaiseTo(value)}>{i === 0 ? 'Min' : value === legal.raise!.max ? 'Max' : money(value)}</button>)}</div></>}{allIn !== null && allIn !== undefined && <button className={styles.allIn} disabled={!writable || busy} onClick={() => void commit({ kind: 'raiseTo', amount: allIn })}>All-in · {money(allIn)}</button>}</> : <p role="status">Calculating an action from the bot’s own cards and public history.</p>}</section><section className={styles.historyPanel}><h2>Actions</h2><ol>{session.decisions.map((d, i) => <li key={i}><span>{d.frame.actor === 'hero' ? 'You' : 'Bot'} · {d.frame.street}</span><strong>{displayAction(d.action, d.amount)}</strong></li>)}</ol>{!session.decisions.length && <p>No actions yet.</p>}</section></div>
      <div className={styles.subtleActions}><label>Animation <select value={animationSpeed} onChange={e => { const value = e.target.value as typeof animationSpeed; setAnimationSpeed(value); void putPreference({ owner, chipsAsBb, animationSpeed: value }); }}><option value="normal">Normal</option><option value="fast">Fast</option><option value="none">None</option></select></label><button disabled={!writable || busy} onClick={() => void abandonActive(owner).then(() => { sessionRef.current = null; setSession(null); setError(''); })}>End session</button></div></>}
  </div>;
}
function History() {
  const { owner, ready } = useAuth();
  const [hands, setHands] = React.useState<HandRecord[]>([]);
  const [filter, setFilter] = React.useState<'all' | 'bookmarked' | Difficulty>('all');
  const [page, setPage] = React.useState(0);
  const [bookmarkBusy, setBookmarkBusy] = React.useState<string | null>(null);
  async function toggleBookmark(hand: HandRecord): Promise<void> {
    if (bookmarkBusy) return;
    setBookmarkBusy(hand.id);
    try {
      await setBookmark(owner, hand.id, !hand.bookmarked);
      setHands(await listHands(owner));
      if (owner !== GUEST_OWNER) await synchronize(owner).catch(() => {});
    } finally { setBookmarkBusy(null); }
  }
  React.useEffect(() => { if (!ready) return; let live = true; void (async () => { if (owner !== GUEST_OWNER) await synchronize(owner).catch(() => {}); const rows = await listHands(owner); if (live) setHands(rows); })(); return () => { live = false; }; }, [owner, ready]);
  const filtered = hands.filter(h => filter === 'all' || (filter === 'bookmarked' ? h.bookmarked : h.difficulty === filter));
  return <div className={styles.page}><div className={styles.pageHead}><div><span className={styles.eyebrow}>YOUR ARCHIVE</span><h1>Hand history</h1></div><select aria-label="Filter hands" value={filter} onChange={e => { setFilter(e.target.value as typeof filter); setPage(0); }}><option value="all">All hands</option><option value="bookmarked">Bookmarked</option><option value="easy">Easy</option><option value="standard">Standard</option></select></div>{filtered.length === 0 ? <div className={styles.empty}><p>No hands here yet.</p><Link className={styles.primary} to="/play">Play a hand</Link></div> : <><div className={styles.list}>{filtered.slice(page * 50, (page + 1) * 50).map(h => <article key={h.id} className={styles.handRow}><div><strong><Link to={`/review/${h.id}`}>{h.initialHeroHole.map(cardToText).join(' ')}</Link></strong><span>{new Date(h.completedAt).toLocaleString()} · {h.difficulty} · {h.decisions.length} actions</span></div><strong className={h.heroNet >= 0 ? styles.positive : styles.negative}>{h.heroNet >= 0 ? '+' : ''}{(h.heroNet / 100).toFixed(1)} bb</strong><button disabled={bookmarkBusy !== null} aria-label={h.bookmarked ? 'Remove bookmark' : 'Bookmark hand'} onClick={() => void toggleBookmark(h)}>{h.bookmarked ? '★' : '☆'}</button></article>)}</div><div className={styles.pagination}><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {Math.ceil(filtered.length / 50)}</span><button disabled={(page + 1) * 50 >= filtered.length} onClick={() => setPage(page + 1)}>Next</button></div></>}</div>;
}
function Review() {
  const { owner } = useAuth();
  const { handId } = useParams();
  const [hand, setHand] = React.useState<HandRecord | null | undefined>();
  const [index, setIndex] = React.useState(0);
  const [estimate, setEstimate] = React.useState<EquityEstimate | null>(null);
  const [error, setError] = React.useState('');
  React.useEffect(() => { setHand(undefined); if (handId) void getHand(owner, handId).then(setHand); }, [handId, owner]);
  const decision = hand?.decisions[index];
  React.useEffect(() => {
    setEstimate(null); setError('');
    if (!decision || decision.frame.actor !== 'hero') return;
    let live = true;
    void requestEquity({ hole: decision.heroHole, board: decision.frame.board }).then(x => { if (live) setEstimate(x); }).catch(e => { if (live) setError(e instanceof Error ? e.message : 'Estimate unavailable'); });
    return () => { live = false; };
  }, [handId, index, hand]);
  if (hand === undefined) return <div className={styles.page}>Loading hand…</div>;
  if (!hand) return <div className={styles.page}><h1>Hand unavailable</h1><p>It may have been removed from this device or pruned from cloud history.</p><Link to="/history">Return to history</Link></div>;
  if (!decision) return <div className={styles.page}><h1>Hand complete</h1><p>No decision events were saved.</p><Link to="/history">Return to history</Link></div>;
  const f = decision.frame;
  const q = potOdds(f.pot, f.legal?.call ?? 0);
  let comparison: Action | null = null;
  if (estimate && f.actor === 'hero' && f.legal) {
    const observation: PlayerObservation = { handId: hand.id, sequence: index, actor: 'hero', hole: decision.heroHole,
      board: f.board, street: f.street, button: hand.button, pot: f.pot, stacks: f.stacks,
      commitments: f.commitments, history: hand.decisions.slice(0, index).map(x => ({ actor: x.frame.actor as Actor, street: x.frame.street, action: x.action, amount: x.amount })),
      legal: f.legal, highestBet: Math.max(...Object.values(f.commitments)) };
    comparison = chooseAction(observation, hand.difficulty, estimate, () => 0.5);
  }
  const legalText = f.legal ? [f.legal.fold && 'Fold', f.legal.check && 'Check', f.legal.call !== null && `Call ${f.legal.call}`, f.legal.raise && `Raise to ${f.legal.raise.min}–${f.legal.raise.max}`, f.legal.allInTo !== null && `All-in ${f.legal.allInTo}`].filter(Boolean).join(' · ') : 'None';
  return <div className={styles.page}><span className={styles.eyebrow}>HAND REVIEW</span><h1>Decision {index + 1} of {hand.decisions.length}</h1><div className={styles.reviewGrid}><section className={styles.reviewTable}><div className={styles.pot}>Pot <strong>{f.pot.toLocaleString()}</strong></div><div className={styles.reviewBoard}><Cards cards={f.board} hiddenCount={5 - f.board.length} /></div><div className={styles.reviewHero}><Cards cards={decision.heroHole} /><span>You · {f.stacks.hero.toLocaleString()} chips</span></div></section><section className={styles.reviewPanel}><h2>{f.actor === 'hero' ? 'Your decision' : 'Bot action'} · {f.street}</h2><p>Chosen: <strong>{displayAction(decision.action, decision.amount)}</strong></p><p>Effective stack: {Math.min(f.stacks.hero, f.stacks.bot).toLocaleString()} chips</p><p>Legal actions: {legalText}</p>{f.actor === 'hero' ? <><dl><div><dt>Pot odds</dt><dd>{q === null ? 'No call required' : `${(q * 100).toFixed(1)}%`}</dd></div><div><dt>Sampled equity</dt><dd>{estimate ? `${(estimate.equity * 100).toFixed(1)}%` : error || 'Calculating…'}</dd></div><div><dt>Range</dt><dd>Uniform legal opponent hands</dd></div><div><dt>Samples</dt><dd>{estimate?.samples ?? '—'}</dd></div></dl>{comparison && <p className={styles.notice}>Experimental policy comparison: {displayAction(comparison, f.legal?.call ?? 0)}. A different action does not prove a mistake.</p>}</> : <p>Decision-time analysis is shown for your actions.</p>}</section></div><div className={styles.pagination}><button disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button><span>{index + 1} / {hand.decisions.length}</span><button disabled={index === hand.decisions.length - 1} onClick={() => setIndex(index + 1)}>Next</button></div><div className={styles.finalLine}>Final board: {hand.finalBoard.map(cardToText).join(' ') || 'None'} · Result: {hand.heroNet >= 0 ? '+' : ''}{hand.heroNet} chips {hand.botHole && <>· Bot: {hand.botHole.map(cardToText).join(' ')}</>}</div><Link to="/history">← Back to history</Link></div>;
}
function Progress() {
  const { owner } = useAuth();
  const [hands, setHands] = React.useState<HandRecord[]>([]);
  const [pending, setPending] = React.useState<HandRecord[]>([]);
  const [totals, setTotals] = React.useState<Array<{ difficulty: Difficulty; bot_version: string; game_config: string; hands: number; net_chips: number; vpip: number; pfr: number; showdowns: number; showdown_wins: number }> | null>(null);
  React.useEffect(() => {
    let live = true;
    void Promise.all([listHands(owner), pendingSync(owner)]).then(([all, unsynced]) => { if (live) { setHands(all); setPending(unsynced); } });
    if (cloud && owner !== GUEST_OWNER) void cloud.from('stat_totals').select('*').then(({ data, error }) => { if (live) setTotals(error ? null : data as typeof totals); });
    else setTotals(null);
    return () => { live = false; };
  }, [owner]);
  const groups = ['easy', 'standard'] as const;
  return <div className={styles.page}><span className={styles.eyebrow}>YOUR PROGRESS</span><h1>Results</h1><p>Results describe your play against versioned experimental policies. Poker outcomes vary substantially between hands.</p><div className={styles.featureGrid}>{groups.map(difficulty => {
    const saved = totals?.find(t => t.difficulty === difficulty && t.bot_version === `${difficulty}-v1` && t.game_config === 'hu-50-100-10000');
    const rows = (saved ? pending : hands).filter(h => h.difficulty === difficulty);
    const count = (saved?.hands ?? 0) + rows.length;
    const net = (saved?.net_chips ?? 0) + rows.reduce((n, h) => n + h.heroNet, 0);
    const vpip = (saved?.vpip ?? 0) + rows.filter(h => h.decisions.some(d => d.frame.actor === 'hero' && d.frame.street === 'preflop' && (d.action.kind === 'call' || d.action.kind === 'raiseTo'))).length;
    const pfr = (saved?.pfr ?? 0) + rows.filter(h => h.decisions.some(d => d.frame.actor === 'hero' && d.frame.street === 'preflop' && d.action.kind === 'raiseTo')).length;
    const showdowns = (saved?.showdowns ?? 0) + rows.filter(h => h.reachedShowdown).length;
    const wins = (saved?.showdown_wins ?? 0) + rows.filter(h => h.reachedShowdown && h.heroWonShowdown).length;
    return <article key={difficulty} className={styles.statCard}><h2>{difficulty === 'easy' ? 'Easy' : 'Standard'} · {difficulty}-v1</h2><p>{saved ? 'Cloud totals plus unsynced hands' : 'Hands saved on this device'}</p><dl><div><dt>Hands</dt><dd>{count}</dd></div><div><dt>Net</dt><dd>{(net / 100).toFixed(1)} bb</dd></div><div><dt>bb / 100</dt><dd>{count ? (net / count).toFixed(1) : '—'}</dd></div><div><dt>VPIP</dt><dd>{count ? `${(vpip / count * 100).toFixed(0)}%` : '—'}</dd></div><div><dt>PFR</dt><dd>{count ? `${(pfr / count * 100).toFixed(0)}%` : '—'}</dd></div><div><dt>Showdown frequency</dt><dd>{count ? `${(showdowns / count * 100).toFixed(0)}% (${showdowns})` : '—'}</dd></div><div><dt>Won at showdown</dt><dd>{showdowns ? `${(wins / showdowns * 100).toFixed(0)}% (${wins}/${showdowns})` : '—'}</dd></div></dl></article>;
  })}</div></div>;
}
function Settings() {
  const { owner, user } = useAuth();
  const [message, setMessage] = React.useState('');
  const [guestCount, setGuestCount] = React.useState(0);
  React.useEffect(() => { if (user && !localStorage.getItem(`poker-guest-import-${user.id}`)) void listHands(GUEST_OWNER).then(h => setGuestCount(h.length)); else setGuestCount(0); }, [user]);
  const navigate = useNavigate();
  const download = async () => { const text = await exportHands(owner); const blob = new Blob([text], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `poker-practice-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const upload = async (file?: File) => { if (!file) return; try { const result = await importHands(owner, await file.text()); setMessage(`Imported ${result.imported} hands; skipped ${result.duplicates} duplicates.`); } catch (e) { setMessage(e instanceof Error ? e.message : 'Import failed'); } };
  return <div className={styles.page}><span className={styles.eyebrow}>PREFERENCES & DATA</span><h1>Settings</h1><section className={styles.settingsCard}><h2>Account and cloud sync</h2><p>{user ? `Signed in as ${user.email ?? 'Google user'}. Completed hands are saved locally and queued for cloud sync.` : SUPABASE_CONFIGURED ? 'Guest mode is active. Sign in to synchronize completed hands.' : 'Guest mode is active. Cloud sign-in is unavailable in this build.'}</p><div className={styles.actions}>{cloud && !user && <button onClick={() => void signInWithGoogle().catch(e => setMessage(String(e)))}>Sign in with Google</button>}{user && <><button onClick={() => void synchronize(owner).then(r => setMessage(`Cloud sync complete: ${r.uploaded} uploaded, ${r.downloaded} retained hands fetched.`)).catch(() => setMessage('Saved on this device; cloud sync unavailable.'))}>Sync now</button><button onClick={() => void cloud?.auth.signOut().then(() => navigate('/'))}>Sign out</button></>}</div>{user && guestCount > 0 && <div className={styles.notice}><p>Import {guestCount} guest hands into this account? This uploads them only after you choose Import.</p><div className={styles.actions}><button onClick={() => void (async () => { const data = await exportHands(GUEST_OWNER); const r = await importHands(owner, data); localStorage.setItem(`poker-guest-import-${owner}`, 'imported'); setGuestCount(0); setMessage(`Imported ${r.imported} guest hands. Sync will upload them.`); await synchronize(owner).catch(() => setMessage('Imported locally; cloud sync unavailable.')); })()}>Import guest history</button><button onClick={() => { localStorage.setItem(`poker-guest-import-${owner}`, 'declined'); setGuestCount(0); }}>Keep separate</button></div></div>}</section><section className={styles.settingsCard}><h2>Your data</h2><p>Export your saved hands before clearing browser data or changing devices.</p><div className={styles.actions}><button onClick={() => void download()}>Export JSON</button><label className={styles.fileLabel}>Import JSON<input type="file" accept="application/json,.json" onChange={e => void upload(e.target.files?.[0])} /></label></div><button className={styles.danger} onClick={() => { if (window.confirm('Delete all poker data saved on this device?')) void deleteLocal(owner).then(() => { setMessage('Local data deleted.'); navigate('/'); }); }}>Delete local data</button>{user && <button className={styles.danger} onClick={() => { if (window.confirm('Permanently delete your cloud account and its data?')) void deleteAccount().then(() => deleteLocal(owner)).then(() => { setMessage('Account deleted.'); navigate('/'); }).catch(e => setMessage(String(e))); }}>Delete account and cloud data</button>}</section>{message && <p role="status">{message}</p>}</div>;
}
function About() { return <div className={styles.page}><span className={styles.eyebrow}>HOW IT WORKS</span><h1>Practice with clear limits</h1><div className={styles.prose}><p>Easy and Standard are experimental poker bots. They estimate equity against uniformly sampled legal hands, then apply documented rules and some mixed actions. They are not solved GTO opponents.</p><p>Hand review shows exact pot odds and sampled equity under a uniform opponent range. A comparison with the bot policy is a teaching prompt, not an EV-loss or GTO accuracy grade.</p><p>Practice chips have no cash value. The game runs on your device; completed hands can synchronize through an account when configured. The rules engine is poker-engine-ts with a documented blind-contribution patch.</p><p>Build commit: {import.meta.env.VITE_GIT_COMMIT || 'local development'} · Policy versions: easy-v1, standard-v1. Source and third-party notices are documented in the project repository.</p></div></div>; }
function AuthCallback() { const { user, ready } = useAuth(); const navigate = useNavigate(); React.useEffect(() => { if (ready && user) { const route = sessionStorage.getItem('poker-return-to') || '/settings'; sessionStorage.removeItem('poker-return-to'); navigate(route, { replace: true }); } }, [ready, user, navigate]); return <div className={styles.page}><h1>{ready && !user ? 'Sign-in could not be completed' : 'Completing sign-in…'}</h1>{ready && !user && <Link to="/play">Continue as guest</Link>}</div>; }
function AuthenticatedRoutes() {
  const { owner, ready } = useAuth();
  if (!ready) return <p role="status">Checking account…</p>;
  return <Shell key={owner}><Routes key={owner}><Route path="/" element={<Home />} /><Route path="/play" element={<Play />} /><Route path="/history" element={<History />} /><Route path="/review/:handId" element={<Review />} /><Route path="/progress" element={<Progress />} /><Route path="/settings" element={<Settings />} /><Route path="/auth/callback" element={<AuthCallback />} /><Route path="/about" element={<About />} /><Route path="*" element={<div className={styles.page}><h1>Page not found</h1><Link to="/">Go home</Link></div>} /></Routes></Shell>;
}
function App() { return <AuthProvider><BrowserRouter><AuthenticatedRoutes /></BrowserRouter></AuthProvider>; }

createRoot(document.getElementById('root')!).render(<App />);
