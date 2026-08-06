/** Month grid of tasks by due date. */

import { $, escapeHtml, localDateStr } from '../util/dom.js';
import { localeTag } from '../i18n.js';
import { getTasks } from '../state.js';

let calDate = new Date();

/** One pass over the tasks instead of a full scan per day of the month. */
export function bucketByDueDate(tasks) {
  const map = new Map();
  tasks.forEach((t) => {
    if (!t.end) return;
    if (!map.has(t.end)) map.set(t.end, []);
    map.get(t.end).push(t);
  });
  return map;
}

export function renderCalendar() {
  const body = $('calendar-body');
  if (!body) return;

  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  $('cal-title').innerText = new Date(year, month).toLocaleString(localeTag(), {
    month: 'long',
    year: 'numeric'
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = localDateStr();
  const byDate = bucketByDueDate(getTasks());

  // Accumulate then write once; `innerHTML +=` in a loop reparses the whole
  // month on every iteration.
  const out = [];
  for (let i = 0; i < firstDay; i++) {
    out.push('<div class="calendar-day is-blank"></div>');
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    out.push(`<div class="calendar-day ${dateStr === todayStr ? 'today' : ''}"><span class="day-num">${d}</span>`);
    (byDate.get(dateStr) || []).forEach((t) => {
      out.push(
        `<div class="cal-task ${t.status === 'done' ? 'done' : ''}" data-action="openTask" data-id="${escapeHtml(t.id)}" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>`
      );
    });
    out.push('</div>');
  }
  body.innerHTML = out.join('');
}

export function changeMonth(delta) {
  calDate = new Date(calDate.getFullYear(), calDate.getMonth() + delta, 1);
  renderCalendar();
}
