/**
 * Keeps work timers honest across sessions.
 *
 * A running timer persists an absolute `lastStartTime`. Read back naively,
 * every hour the tab spent closed is credited to the task. So while any timer
 * runs we stamp a heartbeat; on boot we finalize running timers as of that
 * heartbeat rather than as of now, and on unload we bank the time cleanly.
 */

import { safeStorageGet, rawStorageSet } from './util/storage.js';
import { HEARTBEAT_KEY, finalizeAllTimers, getTasks, flushTasks, stopHeartbeat } from './state.js';
import { KEYS } from './storage/local.js';

export function writeHeartbeat(ts) {
  rawStorageSet(HEARTBEAT_KEY, ts);
}

export function lastHeartbeat() {
  const seen = Number(safeStorageGet(HEARTBEAT_KEY, 0));
  return Number.isFinite(seen) && seen > 0 ? seen : null;
}

/** Call once after state is loaded. Returns true if any timer was closed out. */
export function reconcileTimersOnBoot() {
  const cutoff = lastHeartbeat() ?? Date.now();
  const touched = finalizeAllTimers(cutoff);
  if (touched) flushTasks();
  return touched;
}

export function installUnloadHandler() {
  window.addEventListener('beforeunload', () => {
    if (!finalizeAllTimers(Date.now())) return;
    // Raw write: safeStorageSet's alert() is useless during unload, and the
    // cloud adapter's async write would never complete.
    rawStorageSet(KEYS.tasks, getTasks());
    stopHeartbeat();
  });
}
