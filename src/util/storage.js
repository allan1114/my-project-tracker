/**
 * localStorage wrappers that treat storage as untrusted and fallible.
 *
 * Corrupt JSON must not halt boot, and a quota error must surface to the user
 * rather than silently dropping their work.
 */

let onWriteError = (key, err) => console.error('[storage] write failed', key, err);

/** Lets the app route quota errors through its own translated alert. */
export function setStorageErrorHandler(fn) {
  onWriteError = fn;
}

export function safeStorageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (e) {
    console.warn('[storage] corrupt key', key, e);
    return fallback;
  }
}

export function safeStorageSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch (e) {
    onWriteError(key, e);
    return false;
  }
}

/** Raw write with no error reporting — for beforeunload, where alert() is useless. */
export function rawStorageSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
