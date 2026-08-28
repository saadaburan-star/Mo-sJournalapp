import { useEffect, useState } from 'react';

import Diary from './screens/Diary.jsx';
import LockScreen from './screens/LockScreen.jsx';
import { init } from './storage/index.js';
import { isPinSet, readToken } from './lib/pinGate.js';
import './App.css';

/**
 * Root: the gate, then the diary.
 *
 * No entry content is read or rendered before the gate has issued a token —
 * <Diary /> is not mounted until then, and it is the only thing that loads
 * entries.
 */
export default function App() {
  // 'checking' → 'first-run' | 'locked' | 'unlocked' | 'no-storage'
  const [phase, setPhase] = useState('checking');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await init();
        // Whether a pin exists is a preference, not diary content — safe to
        // read before unlocking.
        const pinExists = await isPinSet();
        if (cancelled) return;

        if (!pinExists) {
          setPhase('first-run');
          return;
        }
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

  if (phase === 'first-run' || phase === 'locked') {
    return (
      <LockScreen
        firstRun={phase === 'first-run'}
        onUnlocked={() => setPhase('unlocked')}
      />
    );
  }

  return <Diary />;
}
