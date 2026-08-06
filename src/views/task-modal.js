/** Task detail modal: metadata, timer, checklist, comments, attachments. */

import { $, escapeHtml, safeUrl, clampStr, trapFocus } from '../util/dom.js';
import {
  MAX_NAME_LEN, MAX_TEXT_LEN, MAX_FILE_SIZE_BYTES,
  newId, normalizeTask, finalizeTimer, elapsedSeconds, formatDuration
} from '../util/task.js';
import { pick, isZh } from '../i18n.js';
import {
  getTasks, findTask, commit, flushTasks, removeTask, logActivity,
  anyTimerRunning, startHeartbeat, stopHeartbeat
} from '../state.js';
import { celebrate } from '../effects.js';
import { writeHeartbeat } from '../timer-sync.js';

let currentTaskId = null;
let tickHandle = null;

export const getCurrentTaskId = () => currentTaskId;
export const getCurrentTask = () => (currentTaskId ? findTask(currentTaskId) : null);

function startTick() {
  if (!tickHandle) tickHandle = setInterval(updateTimerDisplay, 1000);
}

/**
 * Realign the tick to "now".
 *
 * The interval is started when the modal opens, so its second boundaries are
 * unrelated to when a timer was started — pressing Start could leave the
 * display reading 0s for nearly two seconds. Restarting it on toggle makes the
 * display advance in step with the elapsed second it is reporting.
 */
function restartTick() {
  stopTick();
  startTick();
}
function stopTick() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

/**
 * A task may reference an assignee who is no longer on the team (removed
 * member, or an import from another board). Without this option the <select>
 * silently falls back to "" and the next updateTaskMeta() writes that empty
 * value over the real assignee.
 */
function ensureAssigneeOption(sel, assignee) {
  if (!sel || !assignee) return;
  if (Array.prototype.some.call(sel.options, (o) => o.value === assignee)) return;
  const opt = document.createElement('option');
  opt.value = assignee;
  opt.textContent = pick('(已移除) ', '(removed) ') + assignee;
  sel.appendChild(opt);
}

export function openTaskModal(id) {
  // Bank a timer left running on the previously-open task before switching.
  if (currentTaskId && currentTaskId !== id) {
    const prev = findTask(currentTaskId);
    if (finalizeTimer(prev, Date.now())) {
      if (!anyTimerRunning()) stopHeartbeat();
      flushTasks();
    }
  }

  const t = findTask(id);
  if (!t) {
    currentTaskId = null;
    return;
  }
  currentTaskId = id;

  $('m-title').innerText = t.name;
  $('m-status').value = t.status;
  ensureAssigneeOption($('m-assignee'), t.assignee);
  $('m-assignee').value = t.assignee;
  $('m-priority').value = t.priority;
  $('m-tags').value = (t.tags || []).join(', ');
  $('m-img').value = t.img || '';
  $('m-desc').value = t.desc || '';

  renderChecklist(t);
  renderComments(t);
  renderAttachments(t);
  updateTimerUI(t);

  const modal = $('taskModal');
  modal.classList.add('active');
  startTick();
  trapFocus(modal);
}

export function onTaskModalClosed() {
  stopTick();
  currentTaskId = null;
}

/* ---------- metadata ---------- */

export function updateTaskStatus() {
  const t = getCurrentTask();
  if (!t) return;
  const from = t.status;
  const to = $('m-status').value;
  if (from === to) return;
  t.status = to;
  if (to === 'done') celebrate();
  logActivity(`🔀 "${t.name}": ${from} → ${to}`);
  commit();
}

export function updateTaskMeta() {
  const t = getCurrentTask();
  if (!t) return;
  t.assignee = $('m-assignee').value;
  t.priority = $('m-priority').value;
  t.img = clampStr($('m-img').value, MAX_TEXT_LEN);
  t.desc = clampStr($('m-desc').value, 10000);
  t.tags = $('m-tags').value.split(',').map((x) => x.trim()).filter(Boolean).map((x) => clampStr(x, 50));
  commit();
}

export function cloneTask() {
  const t = getCurrentTask();
  if (!t) return;
  const n = normalizeTask(JSON.parse(JSON.stringify(t)));
  n.id = newId();
  n.name = clampStr(t.name + ' (Copy)', MAX_NAME_LEN);
  n.status = 'todo';
  n.timer = { totalSeconds: 0, isRunning: false };
  n.comments = [];
  getTasks().push(n);
  logActivity(`©️ Cloned: "${t.name}"`);
  commit();
  alert(pick('已複製', 'Cloned'));
  closeTaskModal();
}

export function deleteCurrentTask() {
  const t = getCurrentTask();
  if (!t) return;
  if (!confirm(pick(`刪除任務「${t.name}」？`, `Delete task "${t.name}"?`))) return;
  removeTask(t.id);
  logActivity(`🗑 Deleted: "${t.name}"`);
  closeTaskModal();
}

function closeTaskModal() {
  $('taskModal').classList.remove('active');
  onTaskModalClosed();
}

/* ---------- timer ---------- */

export function toggleTimer() {
  const t = getCurrentTask();
  if (!t) return;
  if (!t.timer) t.timer = { totalSeconds: 0, isRunning: false };

  if (t.timer.isRunning) {
    finalizeTimer(t, Date.now());
    if (!anyTimerRunning()) stopHeartbeat();
    logActivity(`⏸ Timer stopped: "${t.name}"`);
  } else {
    t.timer.isRunning = true;
    t.timer.lastStartTime = Date.now();
    startHeartbeat(writeHeartbeat);
    restartTick();
    logActivity(`▶ Timer started: "${t.name}"`);
  }
  commit();
  updateTimerUI(t);
}

function updateTimerUI(t) {
  if (!t) return;
  if (!t.timer) t.timer = { totalSeconds: 0, isRunning: false };
  const btn = $('m-timer-btn');
  btn.innerText = t.timer.isRunning ? '⏸ Pause' : '▶ Start';
  btn.classList.toggle('running', !!t.timer.isRunning);
  updateTimerDisplay();
}

function updateTimerDisplay() {
  if (!currentTaskId || !$('taskModal').classList.contains('active')) return;
  const t = getCurrentTask();
  if (!t?.timer) return;
  $('m-time-display').innerText = formatDuration(elapsedSeconds(t));
}

/* ---------- checklist ---------- */

export function renderChecklist(t) {
  const items = t.checklist || [];
  let done = 0;
  const html = items
    .map((i, x) => {
      if (i.done) done++;
      return (
        `<li class="checklist-item ${i.done ? 'done' : ''}">` +
        `<input type="checkbox" ${i.done ? 'checked' : ''} data-action="toggleCheck" data-idx="${x}" aria-label="${escapeHtml(i.text)}">` +
        `<span style="flex:1">${escapeHtml(i.text)}</span>` +
        `<button data-action="remCheck" data-idx="${x}" aria-label="Remove item" class="btn-icon-danger">×</button></li>`
      );
    })
    .join('');
  $('m-checklist').innerHTML = html;
  $('m-progress-bar').style.width = (items.length ? (done / items.length) * 100 : 0) + '%';
}

export function addCheckItem() {
  const input = $('new-check-item');
  const v = clampStr(input.value.trim(), MAX_NAME_LEN);
  if (!v) return;
  const t = getCurrentTask();
  if (!t) return;
  if (!t.checklist) t.checklist = [];
  t.checklist.push({ text: v, done: false });
  input.value = '';
  commit();
  renderChecklist(t);
}

export function toggleCheckItem(i) {
  const t = getCurrentTask();
  if (!t?.checklist?.[i]) return;
  t.checklist[i].done = !t.checklist[i].done;
  commit();
  renderChecklist(t);
}

export function remCheck(i) {
  const t = getCurrentTask();
  if (!t?.checklist?.[i]) return;
  t.checklist.splice(i, 1);
  commit();
  renderChecklist(t);
}

/* ---------- comments ---------- */

export function renderComments(t) {
  if (!t.comments) t.comments = [];
  $('comment-list').innerHTML = t.comments
    .map(
      (c) =>
        `<li class="comment-item"><div class="comment-header"><span>${escapeHtml(c.author || 'Unknown')}</span> <span>${escapeHtml(c.time)}</span></div><div>${escapeHtml(c.text)}</div></li>`
    )
    .join('');
}

/** `authorName` comes from the signed-in user when there is one. */
export function addComment(authorName) {
  const input = $('new-comment');
  const text = clampStr(input.value.trim(), MAX_TEXT_LEN);
  const t = getCurrentTask();
  if (!t || !text) return;
  if (!t.comments) t.comments = [];
  t.comments.push({
    text,
    author: authorName || t.assignee || 'Me',
    time: new Date().toLocaleString(isZh() ? 'zh-HK' : 'en-US')
  });
  input.value = '';
  commit();
  renderComments(t);
}

/* ---------- attachments ---------- */

export function renderAttachments(t) {
  if (!t.attachments) t.attachments = [];
  $('attachment-list').innerHTML = t.attachments
    .map(
      (a, idx) =>
        `<li class="attachment-item"><span style="font-size:16px;">${a.type === 'file' ? '📄' : '🔗'}</span>` +
        `<a href="${escapeHtml(safeUrl(a.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.name)}</a>` +
        `<button data-action="removeAttach" data-idx="${idx}" aria-label="Remove attachment" class="btn-icon-danger">×</button></li>`
    )
    .join('');
}

export function addAttachmentLink() {
  const input = $('attach-link');
  const url = input.value.trim();
  if (!url) return;
  // safeUrl() demands an absolute http(s)/mailto URL, so reject here rather
  // than storing a link that silently renders as an inert "#".
  if (safeUrl(url) === '#') {
    alert(pick('請輸入完整網址（需以 https:// 開頭）', 'Enter a full URL (must start with https://)'));
    return;
  }
  const t = getCurrentTask();
  if (!t) return;
  if (!t.attachments) t.attachments = [];
  t.attachments.push({ name: clampStr(url, MAX_NAME_LEN), url: clampStr(url, MAX_TEXT_LEN), type: 'link' });
  input.value = '';
  commit();
  renderAttachments(t);
}

/**
 * Records the file's name only — there is no file storage backend, so the URL
 * is inert. Kept explicit rather than pretending an upload happened.
 */
export function recordLocalFile(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const mb = MAX_FILE_SIZE_BYTES / 1024 / 1024;
    alert(pick(`檔案太大 (上限 ${mb} MB)`, `File too large (max ${mb} MB)`));
    input.value = '';
    return;
  }
  const t = getCurrentTask();
  if (!t) return;
  if (!t.attachments) t.attachments = [];
  t.attachments.push({ name: clampStr(file.name, MAX_NAME_LEN), url: '', type: 'file' });
  commit();
  renderAttachments(t);
  input.value = '';
}

export function removeAttachment(idx) {
  const t = getCurrentTask();
  if (!t?.attachments) return;
  t.attachments.splice(idx, 1);
  commit();
  renderAttachments(t);
}

/** Refresh the assignee dropdown after the team list changes. */
export function refreshAssigneeOptions(optionsHtml) {
  $('m-assignee').innerHTML = optionsHtml;
  const t = getCurrentTask();
  if (t) {
    ensureAssigneeOption($('m-assignee'), t.assignee);
    $('m-assignee').value = t.assignee;
  }
}
