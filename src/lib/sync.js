/* The sync module.
 *
 * It reads the local store, pushes what changed, pulls what is newer, and
 * merges by last-edited timestamp. It sits alongside the storage module and
 * behind the same boundary: the UI never calls the network and never awaits
 * it. Every entry point here returns immediately; results arrive through
 * subscriptions.
 *
 * Local is always the source of truth for what is on screen. If sync fails,
 * writing carries on into IndexedDB exactly as before and the next cycle
 * retries. Nothing here can block, interrupt, or discard a sitting.
 */

import { listEntries, putBackup, putEntry } from '../storage/index.js';
import { clearToken, readToken } from './pinGate.js';
import { entryText, isTombstone } from './entry.js';

const SYNC_ENDPOINT = '/api/sync';

/** How often a quiet, idle diary checks for changes from another device. */
const INTERVAL_MS = 60_000;
/** After a local save, wait this long before pushing — writing comes first. */
const DEBOUNCE_MS = 2000;

/** 'synced' | 'syncing' | 'offline' | 'failed' */
let state = typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced';
let started = false;
let running = false;
let intervalId = null;
let debounceId = null;

const stateListeners = new Set();
const changeListeners = new Set();

function setState(next) {
  if (state === next) return;
  state = next;
  stateListeners.forEach((listener) => listener(state));
}

export function getSyncState() {
  return state;
}

export function onSyncState(listener) {
  stateListeners.add(listener);
  listener(state);
  return () => stateListeners.delete(listener);
}

/** Fires when a pull actually changed something locally. */
export function onEntriesChanged(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

class Unauthorized extends Error {}

async function call(path, options, token) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      authorization: `Bearer ${token.value}`,
    },
  });

  if (response.status === 401) throw new Unauthorized();
  if (!response.ok) throw new Error(`sync: ${response.status}`);

  const body = await response.json();
  if (!body?.ok) throw new Error('sync: rejected');
  return body;
}

/**
 * One full cycle: compare manifests, push what is ours, pull what is theirs.
 *
 * The manifest keeps this to two requests regardless of diary size — one to
 * learn what the remote holds, one to exchange only the entries that differ.
 */
async function cycle() {
  if (running) return;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setState('offline');
    return;
  }

  const token = readToken();
  if (!token) {
    // Nothing to sync as: the diary is locked, or the token has expired.
    setState('failed');
    return;
  }

  running = true;
  setState('syncing');

  try {
    const { manifest } = await call(SYNC_ENDPOINT, { method: 'GET' }, token);
    // Tombstones included: a deletion is a change like any other, and has to
    // reach the other devices or they will push the entry straight back.
    const local = await listEntries({ includeDeleted: true });
    const localByDate = new Map(local.map((entry) => [entry.date, entry]));

    const push = local.filter((entry) => {
      // Seeded sample entries belong to the device that generated them.
      if (entry.seeded) return false;
      const remoteUpdatedAt = manifest[entry.date];
      return !remoteUpdatedAt || Date.parse(entry.updatedAt) > Date.parse(remoteUpdatedAt);
    });

    const pull = Object.entries(manifest)
      .filter(([date, remoteUpdatedAt]) => {
        const localEntry = localByDate.get(date);
        return !localEntry || Date.parse(remoteUpdatedAt) > Date.parse(localEntry.updatedAt);
      })
      .map(([date]) => date);

    if (push.length === 0 && pull.length === 0) {
      setState('synced');
      return;
    }

    const result = await call(
      SYNC_ENDPOINT,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ push, pull }),
      },
      token,
    );

    for (const remoteEntry of result.entries || []) {
      const localEntry = localByDate.get(remoteEntry.date);

      // Last write wins — but never silently discard a longer local entry for
      // a shorter remote one. The local copy is kept before it is replaced.
      // A tombstone is the extreme case of shorter, so it is covered too: a
      // day deleted on another device is recoverable from `backups` here.
      if (localEntry && entryText(localEntry).length > entryText(remoteEntry).length) {
        await putBackup(localEntry, isTombstone(remoteEntry) ? 'deleted-elsewhere' : 'replaced-by-remote');
      }

      await putEntry(remoteEntry);
    }

    if (result.entries?.length) {
      changeListeners.forEach((listener) => listener());
    }

    setState('synced');
  } catch (error) {
    if (error instanceof Unauthorized) {
      // The token has expired or the secret was rotated. Drop it so the next
      // load asks for the pin — but do not yank the screen away from someone
      // mid-sentence. Their writing is already safe locally.
      clearToken();
    }
    setState('failed');
  } finally {
    running = false;
  }
}

/** Ask for a sync. Returns immediately; never throws. */
export function requestSync() {
  clearTimeout(debounceId);
  debounceId = setTimeout(() => {
    cycle();
  }, DEBOUNCE_MS);
}

/** Begin background sync. Called once, after the diary is unlocked. */
export function startSync() {
  if (started) return;
  started = true;

  const goOnline = () => {
    setState('syncing');
    cycle();
  };
  const goOffline = () => setState('offline');

  window.addEventListener('online', goOnline);
  window.addEventListener('offline', goOffline);
  intervalId = setInterval(() => cycle(), INTERVAL_MS);

  cycle();

  return () => {
    window.removeEventListener('online', goOnline);
    window.removeEventListener('offline', goOffline);
    clearInterval(intervalId);
    clearTimeout(debounceId);
    started = false;
  };
}
