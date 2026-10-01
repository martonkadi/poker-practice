import { Link } from 'react-router';
import styles from '../styles.module.css';

export function Home() {
  return <section className={styles.hero}><div className={styles.eyebrow}>HEADS-UP HOLD’EM PRACTICE</div><h1>Play the hand. Study the decision.</h1><p>Play complete no-limit hands against an experimental opponent. Revisit your actions and the price of a call. Free practice chips, no account needed.</p><div className={styles.actions}><Link className={styles.primary} to="/play">Start playing</Link><Link className={styles.secondary} to="/about">How it works</Link></div><div className={styles.featureGrid}><article><strong>100bb</strong><span>Fresh stacks each hand</span></article><article><strong>Your pace</strong><span>Play, pause and review</span></article><article><strong>Local saves</strong><span>Hands stay in this browser</span></article></div></section>;
}
