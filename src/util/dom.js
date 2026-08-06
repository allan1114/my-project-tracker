/**
 * DOM and string helpers with no application state.
 *
 * escapeHtml / safeUrl are the two load-bearing security primitives: every
 * user-supplied value reaches the page through one of them.
 */

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Absolute http(s)/mailto URLs only, returning '#' for anything else.
 *
 * Resolving against window.location would quietly turn a typo'd attachment
 * ("drive.google.com/...") into a link back into the app, and would let
 * `javascript:` through on browsers that tolerate it.
 */
export function safeUrl(url) {
  if (!url) return '#';
  try {
    const u = new URL(String(url));
    if (['http:', 'https:', 'mailto:'].includes(u.protocol)) return u.href;
  } catch {
    /* not an absolute URL */
  }
  return '#';
}

/** Local-timezone YYYY-MM-DD. toISOString() would shift the date across UTC. */
export function localDateStr(d) {
  const dt = d ? new Date(d) : new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function debounce(fn, ms) {
  let h;
  return function debounced(...args) {
    clearTimeout(h);
    h = setTimeout(() => fn.apply(this, args), ms);
  };
}

export function clampStr(s, max) {
  return String(s ?? '').slice(0, max);
}

/** Priority is also conveyed by emoji so it never depends on colour alone. */
export function priorityEmoji(p) {
  return p === 'High' ? '🔴' : p === 'Low' ? '🟢' : '🟡';
}

export const $ = (id) => document.getElementById(id);

/* ---------- Modal focus trap ---------- */

let trapState = null;
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function trapFocus(modal) {
  if (!modal) return;
  const prevFocus = document.activeElement;
  const handler = (e) => {
    if (e.key !== 'Tab') return;
    const f = modal.querySelectorAll(FOCUSABLE);
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  modal.addEventListener('keydown', handler);
  trapState = { modal, handler, prevFocus };
  const firstFocusable = modal.querySelector(FOCUSABLE);
  if (firstFocusable) firstFocusable.focus();
}

export function releaseFocusTrap() {
  if (!trapState) return;
  trapState.modal.removeEventListener('keydown', trapState.handler);
  if (trapState.prevFocus?.focus) {
    try {
      trapState.prevFocus.focus();
    } catch {
      /* element left the DOM */
    }
  }
  trapState = null;
}
