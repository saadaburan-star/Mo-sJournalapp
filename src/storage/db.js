/* Minimal promise wrapper over IndexedDB.
   Deliberately hand-rolled rather than pulling a dependency: the surface we
   need is four calls wide, and the Blueprint asks for no third-party code.

   Nothing outside src/storage/ imports this file. The rest of the app talks
   only to the narrow interface in src/storage/index.js. */

const DB_NAME = 'traders-diary';
const DB_VERSION = 1;

export const STORE_ENTRIES = 'entries';
export const STORE_PREFS = 'prefs';

/** Storage failed in a way the UI needs to describe to the writer. */
export class StorageError extends Error {
  /** @param {'unavailable'|'quota'|'unknown'} kind */
  constructor(kind, message, cause) {
    super(message);
    this.name = 'StorageError';
    this.kind = kind;
    this.cause = cause;
  }
}

/** Quota errors surface differently across browsers; normalise them here. */
function toStorageError(error) {
  if (error instanceof StorageError) return error;
  const name = error?.name || '';
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return new StorageError('quota', 'Storage is full.', error);
  }
  return new StorageError('unknown', error?.message || 'Storage failed.', error);
}

let dbPromise = null;

/**
 * Open (and if needed create) the database. Memoised — every caller shares
 * one connection.
 */
export function openDatabase() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    // Private-browsing modes and hardened configurations can remove
    // indexedDB entirely. That is a first-class state, not a crash.
    if (typeof indexedDB === 'undefined' || indexedDB === null) {
      reject(new StorageError('unavailable', 'This browser has no storage available.'));
      return;
    }

    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (error) {
      reject(new StorageError('unavailable', 'Storage could not be opened.', error));
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        // One entry per calendar day — the ISO date is the natural key, so
        // the "one per day" rule is enforced by the schema itself.
        db.createObjectStore(STORE_ENTRIES, { keyPath: 'date' });
      }
      if (!db.objectStoreNames.contains(STORE_PREFS)) {
        db.createObjectStore(STORE_PREFS, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new StorageError('unavailable', 'Storage could not be opened.', request.error));
    request.onblocked = () =>
      reject(new StorageError('unavailable', 'Storage is blocked by another tab.'));
  });

  // A failed open should not be cached forever — let the next call retry.
  dbPromise.catch(() => {
    dbPromise = null;
  });

  return dbPromise;
}

/** Run `work` inside a transaction and resolve once it has committed. */
export async function withStore(storeName, mode, work) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, mode);
    } catch (error) {
      reject(toStorageError(error));
      return;
    }

    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(toStorageError(tx.error));
    tx.onabort = () => reject(toStorageError(tx.error));

    try {
      // `work` hands back the IDBRequest whose result we want.
      const request = work(tx.objectStore(storeName));
      if (request) request.onsuccess = () => { result = request.result; };
    } catch (error) {
      tx.abort();
      reject(toStorageError(error));
    }
  });
}
