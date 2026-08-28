import { useEffect, useState } from 'react';

import Diary from './screens/Diary.jsx';
import LockScreen from './screens/LockScreen.jsx';
import { init } from './storage/index.js';
import { readToken } from './lib/pinGate.js';
import './App.css';

/**
 * Root: the gate, then the diary.
 *
 * No entry content is read or rendered before the gate has issued a token —
 * <Diary /> is not mounted until then, and it is the only thing that loads
 * entries.
 */
export default function App() {
  // 'checking' → 'locked' | 'unlocked' | 'no-storage'
  const [phase, setPhase] = useState('checking');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await init();
        if (cancelled) return;
        // A token that is present and unexpired is what "this device stays
        // unlocked" means. Its signature is checked by the function on the
        // first sync call, not here.
        setPhase(readToken() ? 'unlocked' : 'locked');
      } catch {
        if (!cancelled) setPhase('no-storage');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (phase === 'checking') return null;

  if (phase === 'no-storage') {
    return (
      <div className="storage-error">
        <div className="storage-error__column">
          <div className="micro-label">Private</div>
          <h1 className="storage-error__heading">No storage</h1>
          <div className="storage-error__rule" />
          <p className="storage-error__body">
            This browser is not letting the diary keep anything on this device — usually a
            private window, or storage turned off for this site. Allow site data, or open the
            diary in a normal window, and it will work.
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'locked') {
    return <LockScreen onUnlocked={() => setPhase('unlocked')} />;
  }

  return <Diary />;
}
