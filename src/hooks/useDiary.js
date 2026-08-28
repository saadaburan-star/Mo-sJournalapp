import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  StorageError,
  deleteEntry as removeRecord,
  filterEntries,
  getEntry,
  getPref,
  listEntries,
  putEntry,
  setPref,
} from '../storage/index.js';
import { loadDiary, openToday } from '../lib/diary.js';
import {
  applyText,
  beginSitting,
  collectTags,
  entryText,
  hasWriting,
  normaliseTag,
  tombstoneFor,
} from '../lib/entry.js';
import { monthKey, todayISO } from '../lib/date.js';
import {
  getSyncState,
  onEntriesChanged,
  onSyncState,
  requestSync,
  startSync,
} from '../lib/sync.js';

/** Quiet debounced autosave, so nothing is ever lost mid-thought. */
const AUTOSAVE_MS = 1500;
/** How long "Saved" holds before it fades. */
const SAVED_HOLD_MS = 2600;

/** Whether the archive panel is showing. */
const ARCHIVE_OPEN_KEY = 'archive-open';

const STORAGE_MESSAGES = {
  quota: 'Storage is full. This sitting is safe on screen, but new writing is not being saved.',
  unavailable: 'This browser is not letting the diary save. Your writing is safe until you close the tab.',
  unknown: 'Saving failed. Your writing is safe until you close the tab.',
};

/**
 * All of Today/Write and the archive's state.
 *
 * The UI never touches storage directly — it calls in here, and this calls the
 * storage module. When the sync module lands it sits alongside, in the
 * background, and none of this changes.
 */
export default function useDiary() {
  const [entries, setEntries] = useState([]);
  const [today, setToday] = useState(null);
  const [sittingBlockId, setSittingBlockId] = useState(null);
  const [text, setText] = useState('');
  const [tags, setTags] = useState([]);
  const [saveState, setSaveState] = useState('idle');
  const [storageNotice, setStorageNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [firstRun, setFirstRun] = useState(false);

  const [query, setQuery] = useState('');
  const [closedMonths, setClosedMonths] = useState(() => new Set());
  const [searchClosedMonths, setSearchClosedMonths] = useState(() => new Set());
  const [openEntryDate, setOpenEntryDate] = useState('');
  // The whole archive panel folds away so the writing page can have the
  // window to itself. Remembered across reloads, not just for the session:
  // someone who writes with it shut wants it shut tomorrow too.
  const [archiveOpen, setArchiveOpen] = useState(true);
  const [syncState, setSyncState] = useState(getSyncState);

  const autosaveTimer = useRef(null);
  const savedTimer = useRef(null);
  // Kept in a ref so the debounced write always sees the newest values
  // without re-arming the timer on every keystroke.
  const pending = useRef({ entry: null, text: '', tags: [], sittingBlockId: null });

  const date = today?.date || todayISO();

  /* ---- Load ---------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await loadDiary();
        if (cancelled) return;

        const opened = openToday(stored);
        setEntries(stored);
        setToday(opened.entry);
        setSittingBlockId(opened.sittingBlockId);
        setText(entryText(opened.entry));
        setTags(opened.entry.tags);
        // Nothing written yet, anywhere: this is a genuine first run.
        setFirstRun(stored.length === 0);

        setArchiveOpen((await getPref(ARCHIVE_OPEN_KEY, true)) !== false);

        // Older months sit collapsed; the current month is unfolded.
        const current = monthKey(opened.entry.date);
        setClosedMonths(
          new Set(
            stored
              .map((entry) => monthKey(entry.date))
              .filter((key) => key !== current),
          ),
        );
      } catch (error) {
        if (!cancelled) {
          setStorageNotice(STORAGE_MESSAGES[error?.kind] || STORAGE_MESSAGES.unknown);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Sync ---------------------------------------------------------- */

  // Background only. The UI subscribes to what sync reports and never waits
  // on it; local reads and writes carry on regardless of the network.
  useEffect(() => onSyncState(setSyncState), []);

  useEffect(() => {
    if (!ready) return undefined;
    return startSync();
  }, [ready]);

  // A pull that changed something locally: fold the new entries into the list,
  // and adopt a newer version of today only when doing so cannot interrupt
  // anyone. Typing is never interrupted — that rule outranks freshness.
  useEffect(
    () =>
      onEntriesChanged(async () => {
        const refreshed = await listEntries();
        setEntries(refreshed);

        const { entry: current, text: onScreen } = pending.current;
        if (!current) return;

        const incoming = refreshed.find((entry) => entry.date === current.date);
        if (!incoming) return;

        // Unsaved edits on screen: leave the surface alone. The next save
        // pushes them, and last-write-wins settles it by timestamp.
        if (onScreen !== entryText(current)) return;

        // Adopt when this device has nothing written for today yet, or when
        // the pulled version is genuinely newer than what is on screen.
        const isNewer = Date.parse(incoming.updatedAt) > Date.parse(current.updatedAt);
        if (hasWriting(current) && !isNewer) return;
        if (!hasWriting(incoming)) return;

        const opened = beginSitting(incoming);
        setToday(opened.entry);
        setSittingBlockId(opened.sittingBlockId);
        setText(entryText(opened.entry));
        setTags(opened.entry.tags);
        setFirstRun(false);
      }),
    [],
  );

  /* ---- Writing ------------------------------------------------------- */

  // Keep the ref pointing at the newest values after every render, so the
  // debounced write and the pagehide flush never save a stale draft.
  useEffect(() => {
    pending.current = { entry: today, text, tags, sittingBlockId };
  });

  const persist = useCallback(async () => {
    const { entry, text: draft, tags: draftTags, sittingBlockId: blockId } = pending.current;
    if (!entry) return null;

    // Saving makes the entry the writer's own: a seeded sample they wrote into
    // stops being scaffolding and starts syncing like anything else.
    const { seeded, ...ownEntry } = entry;
    const applied = applyText({ ...ownEntry, tags: draftTags }, draft, blockId);

    try {
      const saved = await putEntry(applied.entry);
      setToday(saved);
      setSittingBlockId(applied.sittingBlockId);
      setEntries((current) => {
        const others = current.filter((item) => item.date !== saved.date);
        return [saved, ...others].sort((a, b) => (a.date < b.date ? 1 : -1));
      });
      setStorageNotice('');
      setFirstRun(false);
      // Tell sync there is something new. Debounced, backgrounded, not awaited.
      requestSync();
      return saved;
    } catch (error) {
      // Never lose in-session work: the text stays on screen and the writer is
      // told plainly, in place. Never a modal while they are typing.
      const kind = error instanceof StorageError ? error.kind : 'unknown';
      setStorageNotice(STORAGE_MESSAGES[kind] || STORAGE_MESSAGES.unknown);
      return null;
    }
  }, []);

  /** Debounced autosave — silent, with no visual feedback at all. */
  const scheduleAutosave = useCallback(() => {
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      persist();
    }, AUTOSAVE_MS);
  }, [persist]);

  const changeText = useCallback(
    (next) => {
      setText(next);
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  /** Explicit save — the sweep and the "Saved" line. */
  const save = useCallback(async () => {
    clearTimeout(autosaveTimer.current);
    clearTimeout(savedTimer.current);
    setSaveState('saving');

    const saved = await persist();
    if (!saved) {
      setSaveState('idle');
      return;
    }

    setSaveState('saved');
    savedTimer.current = setTimeout(() => setSaveState('idle'), SAVED_HOLD_MS);
  }, [persist]);

  // Cmd/Ctrl+S saves. Nothing else is bound to a key in Phase 1.
  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        save();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save]);

  // A last write on the way out, so closing the tab mid-sentence loses nothing.
  useEffect(() => {
    function flush() {
      clearTimeout(autosaveTimer.current);
      persist();
    }
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      clearTimeout(autosaveTimer.current);
      clearTimeout(savedTimer.current);
    };
  }, [persist]);

  /* ---- Tags ---------------------------------------------------------- */

  const addTag = useCallback(
    (raw) => {
      const tag = normaliseTag(raw);
      if (!tag) return;
      setTags((current) => (current.includes(tag) ? current : [...current, tag]));
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  const removeTag = useCallback(
    (tag) => {
      setTags((current) => current.filter((item) => item !== tag));
      scheduleAutosave();
    },
    [scheduleAutosave],
  );

  /* ---- Archive ------------------------------------------------------- */

  // Today is pinned at the top of the panel as the entry being written, so
  // the month list below is past days only.
  const pastEntries = useMemo(
    () => entries.filter((entry) => entry.date !== date),
    [entries, date],
  );

  const searching = query.trim().length > 0;

  const visibleEntries = useMemo(
    () => filterEntries(pastEntries, query),
    [pastEntries, query],
  );

  // A search auto-unfolds matching months; clearing it restores the fold
  // state the writer had before, because that state was never touched.
  useEffect(() => {
    if (searching) setSearchClosedMonths(new Set());
  }, [searching]);

  const isMonthOpen = useCallback(
    (key) => (searching ? !searchClosedMonths.has(key) : !closedMonths.has(key)),
    [searching, searchClosedMonths, closedMonths],
  );

  const toggleMonth = useCallback(
    (key) => {
      const setter = searching ? setSearchClosedMonths : setClosedMonths;
      setter((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [searching],
  );

  /**
   * Delete a past day, behind a confirmation in the row itself.
   *
   * A synced entry leaves a tombstone rather than vanishing: the deletion has
   * to travel to the other devices, and a plain local delete would be undone
   * by the next pull. A seeded sample never reached the shared store, so it is
   * simply removed from this device.
   */
  const deleteEntry = useCallback(async (entryDate) => {
    try {
      const target = await getEntry(entryDate);
      if (!target) return;

      if (target.seeded) {
        await removeRecord(entryDate);
      } else {
        await putEntry(tombstoneFor(target));
        requestSync();
      }

      setEntries(await listEntries());
      setOpenEntryDate((current) => (current === entryDate ? '' : current));
      setStorageNotice('');
    } catch (error) {
      const kind = error instanceof StorageError ? error.kind : 'unknown';
      setStorageNotice(STORAGE_MESSAGES[kind] || STORAGE_MESSAGES.unknown);
    }
  }, []);

  const toggleArchive = useCallback(() => {
    setArchiveOpen((current) => {
      const next = !current;
      setPref(ARCHIVE_OPEN_KEY, next).catch(() => {
        // A preference that will not persist is not worth interrupting anyone
        // over; the panel still folds for this session.
      });
      return next;
    });
  }, []);

  /**
   * Clear the seeded samples in one go.
   *
   * They are scaffolding, and once they are gone the offer to remove them goes
   * with them — the line that triggers this only exists while samples remain,
   * so it can never be shown twice. No tombstones: samples never reached the
   * shared store, so there is nothing to tell the other devices.
   */
  const removeSamples = useCallback(async () => {
    try {
      const all = await listEntries();
      for (const entry of all) {
        if (entry.seeded) await removeRecord(entry.date);
      }
      setEntries(await listEntries());
      setOpenEntryDate('');
      setStorageNotice('');
    } catch (error) {
      const kind = error instanceof StorageError ? error.kind : 'unknown';
      setStorageNotice(STORAGE_MESSAGES[kind] || STORAGE_MESSAGES.unknown);
    }
  }, []);

  /** Only one entry is expanded at a time; opening another closes the first. */
  const toggleEntry = useCallback((entryDate) => {
    setOpenEntryDate((current) => (current === entryDate ? '' : entryDate));
  }, []);

  const knownTags = useMemo(() => collectTags(entries), [entries]);

  return {
    ready,
    date,
    entryNumber: today?.entryNumber || 1,
    text,
    changeText,
    tags,
    addTag,
    removeTag,
    knownTags,
    saveState,
    save,
    storageNotice,
    syncState,
    firstRun,
    // archive
    visibleEntries,
    query,
    setQuery,
    isMonthOpen,
    toggleMonth,
    openEntryDate,
    toggleEntry,
    deleteEntry,
    archiveOpen,
    toggleArchive,
    sampleCount: entries.filter((entry) => entry.seeded).length,
    removeSamples,
  };
}
