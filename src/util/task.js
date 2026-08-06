/**
 * The task shape and the rules that keep it trustworthy.
 *
 * Every path that introduces a task — quick-add, clone, JSON import, the v12
 * migration, a row from Postgres — goes through normalizeTask(). Renderers can
 * then index the DOM by t.status without a null check, and a malformed backup
 * costs one skipped row instead of a blank board.
 */

import { clampStr } from './dom.js';

export const STATUSES = ['todo', 'inprogress', 'onhold', 'blocked', 'done'];
export const PRIORITIES = ['High', 'Medium', 'Low'];
export const MAX_NAME_LEN = 200;
export const MAX_TEXT_LEN = 2000;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Date.now() collides when two tasks are created in the same millisecond (clone does this). */
export function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return 't' + crypto.randomUUID();
  }
  return 't' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}

export function emptyTimer() {
  return { totalSeconds: 0, isRunning: false };
}

/** Returns null for input that isn't salvageable, so callers can .filter(Boolean). */
export function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const t = {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: clampStr(raw.name, MAX_NAME_LEN) || '(untitled)',
    status: STATUSES.includes(raw.status) ? raw.status : 'todo',
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : 'Medium',
    assignee: typeof raw.assignee === 'string' ? clampStr(raw.assignee, MAX_NAME_LEN) : '',
    end: typeof raw.end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.end) ? raw.end : '',
    img: typeof raw.img === 'string' ? clampStr(raw.img, MAX_TEXT_LEN) : '',
    desc: typeof raw.desc === 'string' ? clampStr(raw.desc, 10000) : '',
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((x) => typeof x === 'string' && x).map((x) => clampStr(x, 50))
      : [],
    checklist: Array.isArray(raw.checklist)
      ? raw.checklist
          .filter((i) => i && typeof i === 'object')
          .map((i) => ({ text: clampStr(i.text, MAX_NAME_LEN), done: !!i.done }))
      : [],
    comments: Array.isArray(raw.comments)
      ? raw.comments
          .filter((c) => c && typeof c === 'object')
          .map((c) => ({
            text: clampStr(c.text, MAX_TEXT_LEN),
            author: clampStr(c.author, MAX_NAME_LEN) || 'Unknown',
            time: clampStr(c.time, 64)
          }))
      : [],
    attachments: Array.isArray(raw.attachments)
      ? raw.attachments
          .filter((a) => a && typeof a === 'object')
          .map((a) => ({
            name: clampStr(a.name, MAX_NAME_LEN),
            url: clampStr(a.url, MAX_TEXT_LEN),
            type: a.type === 'file' ? 'file' : 'link'
          }))
      : [],
    timer: emptyTimer()
  };

  const rt = raw.timer;
  if (rt && typeof rt === 'object' && Number.isFinite(Number(rt.totalSeconds))) {
    t.timer.totalSeconds = Math.max(0, Math.floor(Number(rt.totalSeconds)));
    // A running flag is only honoured with a usable start stamp; otherwise the
    // display computes Date.now() - undefined and renders "NaNh NaNm NaNs".
    if (rt.isRunning && Number.isFinite(Number(rt.lastStartTime))) {
      t.timer.isRunning = true;
      t.timer.lastStartTime = Number(rt.lastStartTime);
    }
  }
  return t;
}

/**
 * Bank a running timer's elapsed time as of `at` and stop it.
 *
 * `at` is a parameter rather than Date.now() because on boot we credit only up
 * to the last heartbeat — otherwise every hour the app spent closed is billed
 * to the task. Returns whether anything changed.
 */
export function finalizeTimer(t, at) {
  if (!t?.timer?.isRunning) return false;
  const start = Number(t.timer.lastStartTime);
  const elapsed = Number.isFinite(start) ? Math.max(0, Math.floor((at - start) / 1000)) : 0;
  t.timer.totalSeconds = Math.max(0, (Number(t.timer.totalSeconds) || 0) + elapsed);
  t.timer.isRunning = false;
  delete t.timer.lastStartTime;
  return true;
}

/** Total tracked seconds including the in-flight interval, never NaN. */
export function elapsedSeconds(t, now = Date.now()) {
  if (!t?.timer) return 0;
  let total = Number(t.timer.totalSeconds) || 0;
  if (t.timer.isRunning) {
    const start = Number(t.timer.lastStartTime);
    if (Number.isFinite(start)) total += Math.max(0, Math.floor((now - start) / 1000));
  }
  return Math.max(0, total);
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
}

export function isOverdue(t, today) {
  return t.status !== 'done' && !!t.end && t.end < today;
}
