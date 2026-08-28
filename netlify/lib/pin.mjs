/* Pin hashing and verification — server-side only.
 *
 * scrypt, from Node's standard library. It is a memory-hard KDF, which is what
 * this needs; bcrypt would do as well but would mean a dependency. The pin
 * itself is never stored anywhere — only the hash, and only in an environment
 * variable that the function reads. Never in the bundle, never in the repo. */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/* Cost parameters. N must be a power of two; 2^15 with r=8 lands around 100ms
   on a function's CPU, which is the right order for a gate a person waits on. */
const N = 32768;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const MAX_MEMORY = 128 * N * R * 2; // scrypt refuses to run without headroom

export const PIN_MIN = 8;
export const PIN_MAX = 11;

export function isValidPinShape(pin) {
  return (
    typeof pin === 'string' &&
    /^\d+$/.test(pin) &&
    pin.length >= PIN_MIN &&
    pin.length <= PIN_MAX
  );
}

function derive(pin, salt) {
  return scryptSync(pin, salt, KEY_LENGTH, { N, r: R, p: P, maxmem: MAX_MEMORY });
}

/** Produce the DIARY_PIN_HASH value for a pin. Used by `npm run hash-pin`. */
export function hashPin(pin) {
  const salt = randomBytes(16);
  const hash = derive(pin, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * Compare a candidate pin against a stored hash, in constant time.
 *
 * Returns false rather than throwing on a malformed stored hash — a
 * misconfigured environment variable should read as "wrong pin" to the caller
 * and be diagnosed from the logs, not crash the endpoint.
 */
export function verifyPinHash(pin, stored) {
  if (typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, saltB64, hashB64] = parts;

  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const candidate = scryptSync(pin, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 128 * Number(n) * Number(r) * 2,
    });
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}
