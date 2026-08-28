/* Short-lived signed tokens.
 *
 * The browser never holds the pin — it holds one of these. A token is
 * `<payload>.<signature>`, where the signature is an HMAC-SHA256 over the
 * payload using DIARY_TOKEN_SECRET. The secret never leaves the function, so a
 * token cannot be forged client-side, and the payload is not secret — it only
 * carries issue and expiry times.
 *
 * Node's built-in crypto only: no dependency, nothing to keep patched. */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** "This device stays unlocked" — long enough to mean it, short enough to expire. */
export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest();
}

export function issueToken(secret, now = Date.now()) {
  const expiresAt = now + TOKEN_TTL_MS;
  const payload = base64url(JSON.stringify({ iat: now, exp: expiresAt }));
  return { token: `${payload}.${base64url(sign(payload, secret))}`, expiresAt };
}

/**
 * Verify a token's signature and expiry.
 *
 * Signature comparison is constant-time; a mismatched length is rejected
 * before timingSafeEqual, which throws on unequal buffers.
 */
export function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [payload, signature] = parts;
  const expected = sign(payload, secret);
  const provided = Buffer.from(signature, 'base64url');
  if (provided.length !== expected.length) return false;
  if (!timingSafeEqual(provided, expected)) return false;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof claims.exp === 'number' && claims.exp > now;
  } catch {
    return false;
  }
}

/** Pull the bearer token out of an Authorization header. */
export function bearerFrom(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer (.+)$/i);
  return match ? match[1] : null;
}
