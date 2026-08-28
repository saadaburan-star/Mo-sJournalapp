/* The storage module — the ONLY place in the app that touches persistence.
   Screens and components import from here and nowhere else.

   That boundary is the architectural point of the whole build: the backing
   store can later become an encrypted store, a different host, or a desktop
   filesystem without touching a single screen. A sync module will sit
   alongside this one, reading and writing through the same shapes.

   Interface: init · getEntry · putEntry · listEntries · deleteEntry ·
              searchEntries · getPref · setPref

   ASSUMPTION (Blueprint #1): local persistence uses IndexedDB rather than
   localStorage, because inline images in a later phase will blow past the
   localStorage quota. */

import { openDatabase, withStore, StorageError, STORE_ENTRIES, STORE_PREFS } from './db.js';
import { normaliseEntry } from '../lib/entry.js';

export { StorageError };

/** Open the database up front so the UI learns about storage failure once. */
export async function init() {
  await openDatabase();
}

/** One entry per calendar day, keyed by ISO date. */
export async function getEntry(date) {
  const raw = await withStore(STORE_ENTRIES, 'readonly', (store) => store.get(date));
  return raw ? normaliseEntry(raw) : null;
}

export async function putEntry(entry) {
  const record = normaliseEntry(entry);
  await withStore(STORE_ENTRIES, 'readwrite', (store) => store.put(record));
  return record;
}

/** All entries, newest first. */
export async function listEntries() {
  const raw = (await withStore(STORE_ENTRIES, 'readonly', (store) => store.getAll())) || [];
  return raw.map(normaliseEntry).sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function deleteEntry(date) {
  await withStore(STORE_ENTRIES, 'readwrite', (store) => store.delete(date));
}

/**
 * Search entry text and tags, case-insensitive.
 *
 * A function over entries today; it can become a real index later without
 * changing a single caller. At diary scale — a few hundred entries — a linear
 * scan is well under a frame.
 */
export async function searchEntries(query, entries) {
  const source = entries || (await listEntries());
  return filterEntries(source, query);
}

/** The pure half of search, so the UI can filter an in-memory list live. */
export function filterEntries(entries, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;

  return entries.filter((entry) => {
    const inTags = entry.tags.some((tag) => tag.toLowerCase().includes(needle));
    if (inTags) return true;
    return entry.blocks.some((block) => block.text.toLowerCase().includes(needle));
  });
}

export async function getPref(key, fallback = null) {
  const record = await withStore(STORE_PREFS, 'readonly', (store) => store.get(key));
  return record ? record.value : fallback;
}

export async function setPref(key, value) {
  await withStore(STORE_PREFS, 'readwrite', (store) => store.put({ key, value }));
}
