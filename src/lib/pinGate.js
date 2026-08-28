/* The pin gate.
 *
 * ==========================================================================
 *  PHASE 1 PLACEHOLDER — THIS IS NOT SECURITY. READ BEFORE SHIPPING PUBLICLY.
 * ==========================================================================
 *  The handoff is emphatic, and correct: a pin compared in front-end
 *  JavaScript is no lock at all. The real check belongs in a Netlify Function
 *  that holds a bcrypt/scrypt hash in an environment variable, rate-limits
 *  failures per IP, adds a constant delay, and returns a short-lived SIGNED
 *  token. Sync is deferred, so that function does not exist yet.
 *
 *  What exists here is the same interface, backed locally, so that:
 *    - the lock screen's states are all real and exercisable now, and
 *    - swapping in the function later means replacing the two calls below
 *      with fetch(), and nothing else in the app changes.
 *
 *  Until then this gate stops someone glancing at the screen. It does not
 *  stop anyone willing to open devtools. Do not treat the diary as protected
 *  by it, and do not deploy it to a public URL expecting privacy.
 * ==========================================================================
 */

import { getPref, setPref } from '../storage/index.js';

export const PIN_MIN = 8;
export const PIN_MAX = 11;

/** Blueprint: rate-limit failures — a short lockout after 5 attempts. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;

/** A deliberate constant delay on every check, so timing gives nothing away. */
const CHECK_DELAY_MS = 250;

/** The token, not the pin, is what the browser keeps. */
const TOKEN_KEY = 'traders-diary.token';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // "this device stays unlocked"

const PIN_RECORD_KEY = 'pin';
const ATTEMPTS_KEY = 'pin-attempts';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomHex(bytes) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return [...buffer].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* SHA-256 with a random salt. A real deployment uses bcrypt or scrypt
   server-side; this only keeps the pin from sitting in storage in the clear. */
async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isValidPinShape(pin) {
  return /^\d+$/.test(pin) && pin.length >= PIN_MIN && pin.length <= PIN_MAX;
}

export async function isPinSet() {
  return Boolean(await getPref(PIN_RECORD_KEY));
}

function issueToken() {
  const token = { value: randomHex(24), expiresAt: Date.now() + TOKEN_TTL_MS };
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  } catch {
    // A browser that refuses localStorage still unlocks for this session;
    // it simply asks for the pin again next time.
  }
  return token;
}

export function readToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const token = JSON.parse(raw);
    if (!token?.expiresAt || token.expiresAt < Date.now()) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}

async function readAttempts() {
  return (await getPref(ATTEMPTS_KEY)) || { count: 0, lockedUntil: 0 };
}

/** Milliseconds still to wait, or 0 when not locked out. */
export async function lockoutRemaining() {
  const attempts = await readAttempts();
  return Math.max(0, attempts.lockedUntil - Date.now());
}

/** First run: the writer chooses the pin. Never hardcoded, never committed. */
export async function setPin(pin) {
  if (!isValidPinShape(pin)) return { ok: false, reason: 'short' };

  const salt = randomHex(16);
  await setPref(PIN_RECORD_KEY, { salt, hash: await hashPin(pin, salt) });
  await setPref(ATTEMPTS_KEY, { count: 0, lockedUntil: 0 });

  return { ok: true, token: issueToken() };
}

/**
 * Verify a pin. Mirrors the Netlify Function's eventual contract exactly:
 * async, constant-delayed, and returning a token rather than a boolean.
 */
export async function verifyPin(pin) {
  const started = Date.now();
  const settle = async (result) => {
    // Constant delay regardless of outcome — shape errors included.
    await delay(Math.max(0, CHECK_DELAY_MS - (Date.now() - started)));
    return result;
  };

  const attempts = await readAttempts();
  if (attempts.lockedUntil > Date.now()) {
    return settle({ ok: false, reason: 'lockedOut', retryAfter: attempts.lockedUntil - Date.now() });
  }

  if (!isValidPinShape(pin)) return settle({ ok: false, reason: 'short' });

  const record = await getPref(PIN_RECORD_KEY);
  if (!record) return settle({ ok: false, reason: 'wrong' });

  const candidate = await hashPin(pin, record.salt);
  if (candidate !== record.hash) {
    const count = attempts.count + 1;
    const lockedUntil = count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
    await setPref(ATTEMPTS_KEY, { count: lockedUntil ? 0 : count, lockedUntil });

    if (lockedUntil) {
      return settle({ ok: false, reason: 'lockedOut', retryAfter: LOCKOUT_MS });
    }
    return settle({ ok: false, reason: 'wrong' });
  }

  await setPref(ATTEMPTS_KEY, { count: 0, lockedUntil: 0 });
  return settle({ ok: true, token: issueToken() });
}
