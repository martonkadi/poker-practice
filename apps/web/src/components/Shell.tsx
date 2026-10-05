import type React from 'react';
import { Link } from 'react-router';
import styles from '../styles.module.css';

export function Shell({ children }: { children: React.ReactNode }) {
  return <div className={styles.shell}><header className={styles.header}><Link className={styles.brand} to="/">♠ HeadsUp</Link><nav aria-label="Main navigation"><Link to="/play">Play</Link><Link to="/history">History</Link><Link to="/settings">Settings</Link><Link to="/about">About</Link></nav></header><main>{children}</main><footer>Practice chips · Experimental opponent · Saved in this browser</footer></div>;
}
