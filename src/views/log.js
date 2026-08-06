/** Activity log modal. */

import { $, escapeHtml, trapFocus } from '../util/dom.js';
import { getActivities, clearActivities } from '../state.js';

export function renderLog() {
  $('log-list').innerHTML = getActivities()
    .map(
      (a) =>
        `<li class="log-item"><span>${escapeHtml(a.msg)}</span> <span class="log-time">${escapeHtml(a.time)}</span></li>`
    )
    .join('');
}

export function openLogModal() {
  renderLog();
  const m = $('logModal');
  m.classList.add('active');
  trapFocus(m);
}

export function clearLog() {
  clearActivities();
  renderLog();
}
