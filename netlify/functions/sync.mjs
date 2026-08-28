/* /api/sync — the private store behind the lock.
 *
 * GET  → the manifest: { date: updatedAt } for every entry held remotely.
 *        One small request that tells the client exactly what it needs.
 * POST → { push: [entry], pull: [date] } in one round trip:
 *        writes the pushed entries, returns the pulled ones and a fresh
 *        manifest.
 *
 * Every route requires a valid signed token. There is no path here that
 * returns entry content without one — the diary is not readable, in whole or
 * in part, until the pin has been verified.
 *
 * Storage is Netlify Blobs: one blob per entry plus one manifest blob. The
 * manifest exists because Blobs' list() returns keys but no metadata, so
 * without it a pull would mean fetching every entry just to compare
 * timestamps. It is derived data — if it is ever lost or wrong, rebuild()
 * reconstructs it from the entries themselves.
 */

import { getStore } from '@netlify/blobs';

import { bearerFrom, verifyToken } from '../lib/token.mjs';

const STORE = 'diary';
const MANIFEST_KEY = 'manifest';
const ENTRY_PREFIX = 'entries/';

/** A diary day is a plain ISO date; nothing else is a valid key. */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** One sitting is prose, not a payload. This is a generous ceiling. */
const MAX_ENTRY_BYTES = 512 * 1024;
const MAX_ENTRIES_PER_PUSH = 200;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

async function readManifest(store) {
  try {
    return (await store.get(MANIFEST_KEY, { type: 'json' })) || {};
  } catch {
    return {};
  }
}

/** Rebuild the manifest from the entries themselves, when it is missing. */
async function rebuildManifest(store) {
  const manifest = {};
  const { blobs } = await store.list({ prefix: ENTRY_PREFIX });

  for (const blob of blobs) {
    const entry = await store.get(blob.key, { type: 'json' });
    if (entry?.date && entry?.updatedAt) manifest[entry.date] = entry.updatedAt;
  }

  await store.setJSON(MANIFEST_KEY, manifest);
  return manifest;
}

/**
 * Accept only what an entry actually is.
 *
 * Content arrives as structured data and is stored as structured data — it is
 * never rendered as HTML by this endpoint, and the client sanitises on its
 * side too. Rejecting the wrong shape here keeps the store clean regardless.
 */
function validEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (!DATE_PATTERN.test(entry.date)) return false;
  if (typeof entry.updatedAt !== 'string' || Number.isNaN(Date.parse(entry.updatedAt))) {
    return false;
  }

  // A tombstone records that a day was deleted. It carries no content, and it
  // travels through the same last-write-wins path as any other change — which
  // is the only way a deletion on one device reaches the others.
  if (entry.deleted === true) return true;

  if (!Array.isArray(entry.blocks) || !Array.isArray(entry.tags)) return false;
  if (entry.blocks.some((block) => typeof block?.text !== 'string')) return false;
  if (entry.tags.some((tag) => typeof tag !== 'string')) return false;
  if (JSON.stringify(entry).length > MAX_ENTRY_BYTES) return false;
  return true;
}

export default async (request) => {
  const secret = process.env.DIARY_TOKEN_SECRET;
  if (!secret) {
    console.error('sync: DIARY_TOKEN_SECRET is not set');
    return json({ ok: false, reason: 'unconfigured' }, 503);
  }

  // Nothing below this line runs without a valid token.
  if (!verifyToken(bearerFrom(request), secret)) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }

  const store = getStore(STORE);

  if (request.method === 'GET') {
    let manifest = await readManifest(store);
    if (Object.keys(manifest).length === 0) manifest = await rebuildManifest(store);
    return json({ ok: true, manifest });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: 'bad-request' }, 400);
  }

  const push = Array.isArray(body?.push) ? body.push : [];
  const pull = Array.isArray(body?.pull) ? body.pull : [];

  if (push.length > MAX_ENTRIES_PER_PUSH || pull.length > MAX_ENTRIES_PER_PUSH) {
    return json({ ok: false, reason: 'too-many' }, 413);
  }

  const manifest = await readManifest(store);

  /* ---- Push -------------------------------------------------------- */

  const rejected = [];
  for (const entry of push) {
    if (!validEntry(entry)) {
      rejected.push(entry?.date ?? null);
      continue;
    }

    // Last write wins, per entry, by last-edited timestamp. There is exactly
    // one writer, so this is the whole conflict rule.
    const remoteUpdatedAt = manifest[entry.date];
    if (remoteUpdatedAt && Date.parse(remoteUpdatedAt) > Date.parse(entry.updatedAt)) {
      continue;
    }

    await store.setJSON(`${ENTRY_PREFIX}${entry.date}`, entry);
    manifest[entry.date] = entry.updatedAt;
  }

  if (push.length > 0) await store.setJSON(MANIFEST_KEY, manifest);

  /* ---- Pull -------------------------------------------------------- */

  const entries = [];
  for (const date of pull) {
    if (!DATE_PATTERN.test(date)) continue;
    const entry = await store.get(`${ENTRY_PREFIX}${date}`, { type: 'json' });
    if (entry) entries.push(entry);
  }

  return json({ ok: true, manifest, entries, rejected });
};

export const config = {
  path: '/api/sync',
  method: ['GET', 'POST'],
};
