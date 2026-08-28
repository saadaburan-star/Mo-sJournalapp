/* POST /api/pin — the lock.
 *
 * This is the real check, and the only one that counts. The browser sends the
 * pin once; this compares it against a scrypt hash held in an environment
 * variable and returns a short-lived signed token. The pin is never stored by
 * the client, and the hash never reaches it.
 *
 * Mitigations, all of them required by the Blueprint because 8–11 digits is a
 * thin gate on its own:
 *   - the comparison happens here, never in front-end JavaScript
 *   - failures are rate-limited per IP, with a lockout after 5
 *   - every response takes a constant ~250ms, so timing gives nothing away
 *   - the response carries a token, never the hash or any entry data
 */

import { getStore } from '@netlify/blobs';

import { isValidPinShape, verifyPinHash } from '../lib/pin.mjs';
import { issueToken } from '../lib/token.mjs';
import { createHash } from 'node:crypto';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;
const CONSTANT_DELAY_MS = 250;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** Rate-limit buckets are keyed by a hash of the IP, never the IP itself. */
function bucketKey(ip, secret) {
  return `attempts/${createHash('sha256').update(`${ip}:${secret}`).digest('hex')}`;
}

export default async (request, context) => {
  const started = Date.now();
  // Hold every response to the same floor, whatever happened inside.
  const settle = async (response) => {
    await delay(Math.max(0, CONSTANT_DELAY_MS - (Date.now() - started)));
    return response;
  };

  const pinHash = process.env.DIARY_PIN_HASH;
  const secret = process.env.DIARY_TOKEN_SECRET;

  if (!pinHash || !secret) {
    // Misconfiguration is the operator's problem, not a hint for a visitor.
    console.error('pin: DIARY_PIN_HASH or DIARY_TOKEN_SECRET is not set');
    return settle(json({ ok: false, reason: 'unconfigured' }, 503));
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return settle(json({ ok: false, reason: 'wrong' }, 400));
  }

  const ip =
    request.headers.get('x-nf-client-connection-ip') || context?.ip || 'unknown';
  const store = getStore('diary-gate');
  const key = bucketKey(ip, secret);

  let attempts = { count: 0, lockedUntil: 0 };
  try {
    attempts = (await store.get(key, { type: 'json' })) || attempts;
  } catch (error) {
    // A gate that cannot read its own counter still refuses bad pins; it just
    // cannot lock out. Log and carry on rather than denying a valid unlock.
    console.error('pin: could not read attempts', error);
  }

  if (attempts.lockedUntil > Date.now()) {
    return settle(
      json({ ok: false, reason: 'lockedOut', retryAfter: attempts.lockedUntil - Date.now() }, 429),
    );
  }

  // Shape is checked here too — the client's check is a courtesy, not a control.
  if (!isValidPinShape(body?.pin)) {
    return settle(json({ ok: false, reason: 'short' }, 400));
  }

  if (!verifyPinHash(body.pin, pinHash)) {
    const count = attempts.count + 1;
    const lockedUntil = count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
    try {
      await store.setJSON(key, { count: lockedUntil ? 0 : count, lockedUntil });
    } catch (error) {
      console.error('pin: could not record attempt', error);
    }

    if (lockedUntil) {
      return settle(json({ ok: false, reason: 'lockedOut', retryAfter: LOCKOUT_MS }, 429));
    }
    return settle(json({ ok: false, reason: 'wrong' }, 401));
  }

  try {
    await store.setJSON(key, { count: 0, lockedUntil: 0 });
  } catch (error) {
    console.error('pin: could not clear attempts', error);
  }

  const { token, expiresAt } = issueToken(secret);
  return settle(json({ ok: true, token: { value: token, expiresAt } }));
};

export const config = {
  path: '/api/pin',
  method: ['POST'],
};
