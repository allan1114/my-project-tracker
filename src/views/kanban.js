/** Kanban board: filtering, optional priority sort, drag-and-drop, card render. */

import { $, escapeHtml, safeUrl, priorityEmoji, localDateStr, debounce } from '../util/dom.js';
import { STATUSES, PRIORITIES, elapsedSeconds, isOverdue } from '../util/task.js';
import { getTasks, findTask, commit, logActivity } from '../state.js';
import { celebrate } from '../effects.js';

let isSorted = false;
let isFocus = false;

export function getFilters() {
  return {
    text: ($('s-text')?.value || '').toLowerCase(),
    member: $('s-member')?.value || '',
    tag: ($('s-tag')?.value || '').toLowerCase()
  };
}

/** Case-insensitive on name and tag; assignee must match exactly. */
export function filterTasks(tasks, f) {
  // Lowercase here rather than trusting the caller to have done it — the
  // function's behaviour shouldn't depend on how its input was prepared.
  const text = (f.text || '').toLowerCase();
  const tag = (f.tag || '').toLowerCase();
  return tasks.filter((t) => {
    if (text && !String(t.name || '').toLowerCase().includes(text)) return false;
    if (f.member && t.assignee !== f.member) return false;
    if (tag && !(t.tags || []).some((x) => String(x).toLowerCase().includes(tag))) return false;
    return true;
  });
}

const PRIORITY_RANK = { High: 3, Medium: 2, Low: 1 };
export function sortByPriority(tasks) {
  return [...tasks].sort((a, b) => (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0));
}

function cardHtml(t) {
  const imgUrl = t.img ? safeUrl(t.img) : '#';
  const img =
    t.img && imgUrl !== '#'
      ? `<img src="${escapeHtml(imgUrl)}" alt="" class="card-img show" onerror="this.style.display='none'">`
      : '';
  const tags = (t.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  const list = t.checklist || [];
  const check = `${list.filter((i) => i.done).length}/${list.length}`;
  const av = t.assignee
    ? `<div class="avatar" title="${escapeHtml(t.assignee)}">${escapeHtml(String(t.assignee)[0] || '').toUpperCase()}</div>`
    : '';
  const attIcon = t.attachments?.length ? '📎' : '';
  const priority = PRIORITIES.includes(t.priority) ? t.priority : 'Medium';

  return (
    `${img}<div class="card-tags">${tags}</div>` +
    `<div class="card-top"><span class="badge bg-${priority.toLowerCase()}">${priorityEmoji(priority)} ${escapeHtml(priority)}</span>` +
    ` <span>${elapsedSeconds(t) > 0 ? '⏱️' : ''} ${attIcon}</span></div>` +
    `<div class="card-title">${escapeHtml(t.name)}</div>` +
    `<div class="card-meta"><div class="meta-left">${list.length ? '☑ ' + check : ''} ${t.comments?.length ? '💬 ' + t.comments.length : ''}</div>${av}</div>`
  );
}

export function renderKanban() {
  const board = $('main-board');
  if (!board) return;

  STATUSES.forEach((id) => {
    $(id).innerHTML = '';
  });

  let visible = filterTasks(getTasks(), getFilters());
  if (isSorted) visible = sortByPriority(visible);

  const counts = { todo: 0, inprogress: 0, onhold: 0, blocked: 0, done: 0 };
  // One fragment per column, appended once — otherwise every card forces a reflow.
  const frags = {};
  STATUSES.forEach((s) => {
    frags[s] = document.createDocumentFragment();
  });

  const today = localDateStr();
  visible.forEach((t) => {
    // Never index the DOM with unvalidated data: an unrecognized status would
    // hand getElementById null and blank the entire board.
    const status = STATUSES.includes(t.status) ? t.status : 'todo';
    counts[status]++;

    const card = document.createElement('div');
    card.className = 'task-card' + (isOverdue(t, today) ? ' overdue' : '');
    card.draggable = true;
    card.id = t.id;
    card.dataset.action = 'openTask';
    card.dataset.id = t.id;
    card.ondragstart = (ev) => ev.dataTransfer.setData('text', t.id);
    card.innerHTML = cardHtml(t);
    frags[status].appendChild(card);
  });

  STATUSES.forEach((s) => $(s).appendChild(frags[s]));
  Object.keys(counts).forEach((k) => {
    $('c-' + k).innerText = counts[k];
  });
}

export const debouncedRenderKanban = debounce(renderKanban, 300);

/* ---------- toggles ---------- */

export function toggleSort() {
  isSorted = !isSorted;
  const btn = $('btn-sort');
  btn.classList.toggle('active', isSorted);
  btn.setAttribute('aria-pressed', String(isSorted));
  renderKanban();
}

export function toggleFocusMode() {
  isFocus = !isFocus;
  $('main-board').classList.toggle('focus-mode', isFocus);
  const btn = $('btn-focus');
  btn.classList.toggle('active', isFocus);
  btn.setAttribute('aria-pressed', String(isFocus));
}

/* ---------- drag and drop ---------- */

export function allowDrop(ev) {
  ev.preventDefault();
  ev.target.closest('.task-list')?.classList.add('drag-over');
}

export function clearDropHint(ev) {
  ev.target.closest('.task-list')?.classList.remove('drag-over');
}

export function drop(ev) {
  ev.preventDefault();
  const col = ev.target.closest('.task-list');
  if (!col) return;
  col.classList.remove('drag-over');
  if (!STATUSES.includes(col.id)) return;

  const task = findTask(ev.dataTransfer.getData('text'));
  if (!task || task.status === col.id) return;

  const from = task.status;
  task.status = col.id;
  if (col.id === 'done') celebrate();
  logActivity(`🔀 "${task.name}": ${from} → ${col.id}`);
  commit();
}
