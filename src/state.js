/**
 * Single source of truth for tasks, members and activities.
 *
 * Reads are synchronous against in-memory arrays so renderers stay simple.
 * Writes are optimistic: mutate memory, notify listeners immediately, then
 * persist through whichever storage adapter is active (localStorage when
 * signed out, Postgres when signed in). A failed persist is reported but never
 * blocks the UI.
 */

import { normalizeTask, finalizeTimer } from './util/task.js';
import { localeTag } from './i18n.js';
import { clampStr } from './util/dom.js';

const MAX_ACTIVITIES = 50;

const state = {
  tasks: [],
  members: ['Me'],
  activities: []
};

let adapter = null;
const listeners = new Set();

export const getTasks = () => state.tasks;
export const getMembers = () => state.members;
export const getActivities = () => state.activities;
export const findTask = (id) => state.tasks.find((t) => t.id === id) || null;

/** Subscribe to any change. Returns an unsubscribe function. */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  listeners.forEach((fn) => {
    try {
      fn(state);
    } catch (e) {
      console.error('[state] listener failed', e);
    }
  });
}

/* ---------- adapter wiring ---------- */

export function getAdapter() {
  return adapter;
}

/**
 * Swap the persistence backend and reload everything from it.
 * Called on boot and again whenever auth state changes.
 */
export async function useAdapter(next) {
  adapter = next;
  const loaded = await adapter.load();
  state.tasks = (loaded.tasks || []).map(normalizeTask).filter(Boolean);
  state.members = (loaded.members || []).filter((m) => typeof m === 'string' && m);
  if (!state.members.length) state.members = ['Me'];
  state.activities = (loaded.activities || []).filter((a) => a && typeof a === 'object');
  notify();
}

function persistTasks() {
  Promise.resolve(adapter?.saveTasks(state.tasks)).catch((e) =>
    console.error('[state] task persist failed', e)
  );
}
function persistMembers() {
  Promise.resolve(adapter?.saveMembers(state.members)).catch((e) =>
    console.error('[state] member persist failed', e)
  );
}
function persistActivities() {
  Promise.resolve(adapter?.saveActivities(state.activities)).catch((e) =>
    console.error('[state] activity persist failed', e)
  );
}

/** Persist the current task array without re-rendering — for background writes. */
export function flushTasks() {
  persistTasks();
}

/* ---------- mutations ---------- */

export function commit() {
  persistTasks();
  notify();
}

export function addTask(fields) {
  const task = normalizeTask(fields);
  if (!task) return null;
  state.tasks.push(task);
  commit();
  return task;
}

export function replaceTasks(next) {
  state.tasks = (next || []).map(normalizeTask).filter(Boolean);
  commit();
}

export function removeTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  commit();
}

export function setMembers(next) {
  state.members = (next || []).filter((m) => typeof m === 'string' && m);
  if (!state.members.length) state.members = ['Me'];
  persistMembers();
  notify();
}

export function addMember(name) {
  if (!name || state.members.includes(name)) return false;
  state.members.push(name);
  persistMembers();
  notify();
  return true;
}

export function removeMember(name) {
  state.members = state.members.filter((m) => m !== name);
  persistMembers();
  notify();
}

export function logActivity(msg) {
  state.activities.unshift({
    msg: clampStr(msg, 500),
    time: new Date().toLocaleString(localeTag())
  });
  while (state.activities.length > MAX_ACTIVITIES) state.activities.pop();
  persistActivities();
}

export function setActivities(next) {
  state.activities = (next || []).slice(0, MAX_ACTIVITIES);
  persistActivities();
}

export function clearActivities() {
  state.activities = [];
  persistActivities();
}

/* ---------- timer reconciliation ---------- */

export const HEARTBEAT_KEY = 'v13_last_seen';
const HEARTBEAT_MS = 5000;
let heartbeatHandle = null;

export function anyTimerRunning() {
  return state.tasks.some((t) => t.timer?.isRunning);
}

/**
 * Stop every running timer as of `at`.
 *
 * On boot `at` is the last heartbeat, not now — a timer left running when the
 * tab closed must not be credited with the intervening hours.
 */
export function finalizeAllTimers(at) {
  let touched = false;
  state.tasks.forEach((t) => {
    if (finalizeTimer(t, at)) touched = true;
  });
  return touched;
}

export function startHeartbeat(write) {
  if (heartbeatHandle) return;
  write(Date.now());
  heartbeatHandle = setInterval(() => {
    if (!anyTimerRunning()) {
      stopHeartbeat();
      return;
    }
    write(Date.now());
  }, HEARTBEAT_MS);
}

export function stopHeartbeat() {
  if (heartbeatHandle) {
    clearInterval(heartbeatHandle);
    heartbeatHandle = null;
  }
}
