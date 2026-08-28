/* Diary service — composes the storage module, the entry model, and the seed.
   The UI calls this; it never reaches past it into storage. */

import {
  init,
  listEntries,
  putEntry,
  getPref,
  setPref,
} from '../storage/index.js';
import { buildSeedEntries } from '../seed/entries.js';
import { beginSitting, createEntry } from './entry.js';
import { todayISO } from './date.js';

const SEEDED_KEY = 'seeded';

/**
 * Open storage and return every entry, newest first.
 *
 * Seeds the realistic past entries on genuine first run only — the flag means
 * a writer who deletes everything gets an empty diary back, not the samples.
 *
 * Called only after the pin gate has issued a token: no entry content is read
 * before the diary is unlocked.
 */
export async function loadDiary() {
  await init();

  let entries = await listEntries();
  const alreadySeeded = await getPref(SEEDED_KEY, false);

  if (entries.length === 0 && !alreadySeeded) {
    for (const entry of buildSeedEntries()) {
      await putEntry(entry);
    }
    await setPref(SEEDED_KEY, true);
    entries = await listEntries();
  }

  return entries;
}

export function nextEntryNumber(entries) {
  return entries.reduce((highest, entry) => Math.max(highest, entry.entryNumber), 0) + 1;
}

/**
 * Today's entry, created if this is the first sitting of the day, plus the id
 * of the block this sitting writes into.
 *
 * Never makes the writer create an entry by hand — opening the app is the
 * creation. One entry per calendar day is enforced by the date being the key.
 */
export function openToday(entries) {
  const date = todayISO();
  const existing = entries.find((entry) => entry.date === date);
  const entry = existing || createEntry(date, nextEntryNumber(entries));
  return { ...beginSitting(entry), isNew: !existing };
}
