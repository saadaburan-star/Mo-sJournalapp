/* The pin gate — client side.
 *
 * The pin is verified by a Netlify Function (netlify/functions/pin.mjs), never
 * here. This module posts the pin once, receives a short-lived signed token,
 * keeps the token, and forgets the pin. There is deliberately no local
 * comparison and no local fallback: a pin checked in front-end JavaScript is
 * no lock at all, and a fallback would quietly reintroduce exactly that.
 *
 * The pin itself is configured at deploy time — `npm run hash-pin` produces the
 * scrypt hash for the DIARY_PIN_HASH environment variable. It is never set from
 * inside the app, never in the bundle, never in the repo.
 *
 * Running the UI with `npm run dev` alone leaves /api/pin unrouted, so the lock
 * will report that it cannot be reached. Use `netlify dev`, which serves the
 * functions alongside Vite.
 */

export const PIN_MIN = 8;
export const PIN_MAX = 11;

const PIN_ENDPOINT = '/api/pin';

/** The token, not the pin, is what the browser keeps. */
const TOKEN_KEY = 'traders-diary.token';

export function isValidPinShape(pin) {
  return /^\d+$/.test(pin) && pin.length >= PIN_MIN && pin.length <= PIN_MAX;
}

function storeToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  } catch {
    // A browser refusing localStorage still unlocks for this session; it
    // simply asks for the pin again next time.
  }
  return token;
}

export function readToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;

    const token = JSON.parse(raw);
    if (!token?.value || !token?.expiresAt || token.expiresAt < Date.now()) {
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

/**
 * Exchange a pin for a token.
 *
 * Resolves to { ok: true, token } or { ok: false, reason }, where reason is one
 * of 'short' | 'wrong' | 'lockedOut' | 'unreachable' | 'unconfigured'. It never
 * rejects: the lock screen turns every outcome into one line of copy.
 */
export async function verifyPin(pin) {
  // Checked here only to save a round trip — the function checks it too, and
  // that check is the one that counts.
  if (!isValidPinShape(pin)) return { ok: false, reason: 'short' };

  let response;
  try {
    response = await fetch(PIN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // A non-JSON response means something other than the function answered —
    // most often the SPA fallback, when functions are not being served.
    return { ok: false, reason: 'unreachable' };
  }

  if (response.ok && body?.ok && body?.token?.value) {
    return { ok: true, token: storeToken(body.token) };
  }

  const known = ['short', 'wrong', 'lockedOut', 'unconfigured'];
  return { ok: false, reason: known.includes(body?.reason) ? body.reason : 'unreachable' };
}
