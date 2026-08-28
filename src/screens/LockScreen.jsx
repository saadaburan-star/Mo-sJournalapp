import { useEffect, useRef, useState } from 'react';

import PrimaryButton from '../components/PrimaryButton.jsx';
import {
  PIN_MAX,
  PIN_MIN,
  isValidPinShape,
  lockoutRemaining,
  setPin as storePin,
  verifyPin,
} from '../lib/pinGate.js';
import './LockScreen.css';

/* 8 required digits, then 3 optional ones — the dot row shows the shape of a
   valid pin without ever stating a length the writer has to count out. */
const REQUIRED_DOTS = PIN_MIN;
const TOTAL_DOTS = PIN_MAX;

/** Every state of the screen is one line of copy and one colour. */
const MESSAGES = {
  idle: { text: 'Enter your pin to open the diary.', tone: 'muted' },
  idleFirstRun: { text: 'Choose a pin to lock the diary.', tone: 'muted' },
  short: { text: `A pin is ${PIN_MIN} to ${PIN_MAX} numbers.`, tone: 'error' },
  wrong: { text: "That pin doesn't match.", tone: 'error' },
  ok: { text: 'Unlocked.', tone: 'ok' },
  lockedOut: { text: 'Too many tries. Wait a minute.', tone: 'error' },
  checking: { text: 'Checking.', tone: 'muted' },
};

export default function LockScreen({ firstRun, onUnlocked }) {
  const [pin, setPinValue] = useState('');
  const [state, setState] = useState(firstRun ? 'idleFirstRun' : 'idle');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  // The caret belongs in the pin field the moment the screen appears.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // A lockout that was still running when the tab was closed is still running
  // now; say so rather than letting the writer type into a dead field.
  useEffect(() => {
    let cancelled = false;
    lockoutRemaining().then((remaining) => {
      if (!cancelled && remaining > 0) setState('lockedOut');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleChange(event) {
    // Strip non-digits and cap at 11 on every keystroke.
    const digits = event.target.value.replace(/\D/g, '').slice(0, PIN_MAX);
    setPinValue(digits);
    if (state !== 'lockedOut' && state !== 'ok') {
      setState(firstRun ? 'idleFirstRun' : 'idle');
    }
  }

  async function submit() {
    if (busy || state === 'ok') return;

    if (!isValidPinShape(pin)) {
      setState('short');
      return;
    }

    setBusy(true);
    setState('checking');

    // The gate is async and constant-delayed by design — the same shape the
    // Netlify Function will have, so nothing here changes when it lands.
    const result = firstRun ? await storePin(pin) : await verifyPin(pin);
    setBusy(false);

    if (result.ok) {
      setState('ok');
      setPinValue('');
      // Let "Unlocked." be read before the diary replaces the screen.
      setTimeout(() => onUnlocked(result.token), 420);
      return;
    }

    setState(result.reason);
    setPinValue('');
    inputRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  }

  const message = MESSAGES[state] || MESSAGES.idle;
  const dots = Array.from({ length: TOTAL_DOTS }, (_, index) => ({
    required: index < REQUIRED_DOTS,
    filled: index < pin.length,
  }));

  return (
    <div className="lock">
      <div className="lock__column">
        <div className="lock__private">Private</div>
        <h1 className="lock__heading">Locked</h1>
        <div className="lock__rule" />

        <div className="lock__field-labels">
          <label className="micro-label" htmlFor="pin-field">
            Pin code
          </label>
          <div className="micro-label" aria-hidden="true">
            {pin.length} / {PIN_MIN}–{PIN_MAX}
          </div>
        </div>

        <div className="lock__dots">
          <div className="lock__dot-row" aria-hidden="true">
            {dots.map((dot, index) => (
              <div
                key={index}
                className={[
                  'lock__dot',
                  dot.required ? 'lock__dot--required' : 'lock__dot--optional',
                  dot.filled ? 'lock__dot--filled' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
            ))}
          </div>
          <input
            id="pin-field"
            ref={inputRef}
            className="lock__input focus-caret-only"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={pin}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={state === 'lockedOut'}
          />
          <div className="lock__input-rule" />
        </div>

        <div className="lock__message-row">
          <div
            className={[
              'lock__message',
              message.tone === 'error' ? 'lock__message--error' : '',
              message.tone === 'ok' ? 'lock__message--ok' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="status"
          >
            {message.text}
          </div>
          <PrimaryButton
            variant="lock"
            onClick={submit}
            disabled={busy || state === 'lockedOut'}
          >
            {firstRun ? 'Set pin' : 'Unlock'}
          </PrimaryButton>
        </div>

        <div className="lock__footnote">This device stays unlocked · F11 for full screen</div>
      </div>
    </div>
  );
}
