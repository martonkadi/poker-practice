import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import { StoreStatusProvider } from './storeStatus';
import { ChipUnitProvider } from './chipUnit';
import { Shell } from './components/Shell';
import { Home } from './pages/Home';
import { History } from './pages/History';
import { Review } from './pages/Review';
import { Settings } from './pages/Settings';
import { About } from './pages/About';
import { NotFound } from './pages/NotFound';
import styles from './styles.module.css';

// Play is a separate chunk: it pulls in the rules engine (poker-engine-ts) through
// @poker/poker, useGame, session and workerClient. Keeping it lazy holds the entry
// chunk under the 500,000-byte limit (Req 9.5).
const Play = React.lazy(() => import('./pages/Play'));
function PlayRoute() {
  return <React.Suspense fallback={<div className={styles.page}><p role="status">Loading table…</p></div>}><Play /></React.Suspense>;
}
function App() {
  return <StoreStatusProvider><ChipUnitProvider><BrowserRouter><Shell><Routes><Route path="/" element={<Home />} /><Route path="/play" element={<PlayRoute />} /><Route path="/history" element={<History />} /><Route path="/review/:handId" element={<Review />} /><Route path="/settings" element={<Settings />} /><Route path="/about" element={<About />} /><Route path="*" element={<NotFound />} /></Routes></Shell></BrowserRouter></ChipUnitProvider></StoreStatusProvider>;
}
createRoot(document.getElementById('root')!).render(<App />);
