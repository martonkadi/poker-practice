import { Link } from 'react-router';
import styles from '../styles.module.css';

/** Fallback for unknown paths, including deferred ones such as /signin, /sync and /import. */
export function NotFound() {
  return <div className={styles.page}><h1>Page not found</h1><Link to="/">Go home</Link></div>;
}
