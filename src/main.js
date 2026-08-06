/**
 * Application bootstrap and event wiring.
 *
 * All interaction flows through two delegated listeners on document (`click`
 * and `change`) keyed on `data-action`, replacing the inline onclick=""
 * attributes the single-file version used. Nothing is exposed on `window`.
 */

import './styles/base.css';
import './styles/board.css';
import './styles/modal.css';
import './styles/dashboard.css';

import { $, clampStr, releaseFocusTrap } from './util/dom.js';
import { MAX_NAME_LEN } from './util/task.js';
import { applyLanguage, toggleLang, pick, t } from './i18n.js';
import { setStorageErrorHandler } from './util/storage.js';
import { useAdapter, addTask as addTaskToState, logActivity, subscribe, getTasks } from './state.js';
import { createLocalAdapter } from './storage/local.js';
import { reconcileTimersOnBoot, installUnloadHandler } from './timer-sync.js';
import { exportData, importData } from './backup.js';

import {
  renderKanban, debouncedRenderKanban, toggleSort, toggleFocusMode,
  allowDrop, clearDropHint, drop
} from './views/kanban.js';
import { renderCalendar, changeMonth } from './views/calendar.js';
import {
  openTaskModal, onTaskModalClosed, updateTaskStatus, updateTaskMeta, cloneTask,
  deleteCurrentTask, toggleTimer, addCheckItem, toggleCheckItem, remCheck,
  addComment, addAttachmentLink, recordLocalFile, removeAttachment
} from './views/task-modal.js';
import { openTeamModal, addMember, removeMember, renderMemberSelects } from './views/team.js';
import { openLogModal, clearLog } from './views/log.js';
import { openDashboard, destroyCharts, renderCharts } from './views/dashboard.js';
import { initAuth, signIn, signOut, currentUserName } from './auth/index.js';

let currentView = 'kanban';

/* ---------- theme ---------- */

function applyStoredTheme() {
  try {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch {
    /* storage blocked */
  }
}

function toggleTheme() {
  const el = document.documentElement;
  const isDark = el.getAttribute('data-theme') === 'dark';
  el.setAttribute('data-theme', isDark ? 'light' : 'dark');
  try {
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
  } catch {
    /* storage blocked */
  }
  // Chart colours are read from CSS variables at construction time.
  if (currentView === 'dashboard' || $('dashboardModal')?.classList.contains('active')) renderCharts();
}

/* ---------- views ---------- */

function switchView(view) {
  currentView = view;
  $('kanban-wrapper').style.display = view === 'kanban' ? 'block' : 'none';
  $('calendar-view').style.display = view === 'calendar' ? 'block' : 'none';
  $('btn-view-kanban').classList.toggle('active', view === 'kanban');
  $('btn-view-calendar').classList.toggle('active', view === 'calendar');
  if (view === 'calendar') renderCalendar();
  if (view === 'kanban') renderKanban();
}

function closeModal(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('active');
  if (id === 'taskModal') onTaskModalClosed();
  if (id === 'dashboardModal') destroyCharts();
  releaseFocusTrap();
}

/* ---------- quick add ---------- */

function addTask() {
  const name = clampStr($('t-name').value.trim(), MAX_NAME_LEN);
  if (!name) {
    alert(pick('請輸入名稱', 'Name required'));
    return;
  }
  addTaskToState({
    name,
    priority: $('t-priority').value,
    assignee: $('t-assignee').value || '',
    end: $('t-end').value,
    tags: $('t-tags').value.split(',').map((x) => x.trim()).filter(Boolean),
    img: $('t-img').value,
    status: 'todo'
  });
  logActivity(`➕ New task: "${name}"`);

  // Reset every input. Leaving image URL, assignee, or due date populated
  // silently attached them to the next task created.
  $('t-name').value = '';
  $('t-tags').value = '';
  $('t-img').value = '';
  $('t-priority').value = 'Medium';
  $('t-assignee').value = '';
  $('t-end').valueAsDate = new Date();
  $('t-name').focus();
}

/* ---------- tag menus ---------- */

function toggleTagMenu(id) {
  const menu = $(id);
  const wasOpen = menu.classList.contains('show');
  document.querySelectorAll('.tag-menu').forEach((el) => el.classList.remove('show'));
  if (!wasOpen) menu.classList.add('show');
}

function addTag(inputId, tag, isMeta) {
  const input = $(inputId);
  const tags = input.value.split(',').map((x) => x.trim()).filter(Boolean);
  if (!tags.includes(tag)) {
    tags.push(tag);
    input.value = tags.join(', ');
    if (isMeta) updateTaskMeta();
  }
  document.querySelectorAll('.tag-menu').forEach((el) => el.classList.remove('show'));
}

/* ---------- delegated events ---------- */

const clickActions = {
  viewKanban: () => switchView('kanban'),
  viewCalendar: () => switchView('calendar'),
  sort: toggleSort,
  focusMode: toggleFocusMode,
  toggleLang: () => {
    toggleLang();
    applyLanguage();
    renderMemberSelects();
    if (currentView === 'calendar') renderCalendar();
  },
  openDashboard,
  openLog: openLogModal,
  openTeam: openTeamModal,
  toggleTheme,
  export: exportData,
  import: () => $('fileInput').click(),
  addTask,
  prevMonth: () => changeMonth(-1),
  nextMonth: () => changeMonth(1),
  clone: cloneTask,
  toggleTimer,
  addAttachment: addAttachmentLink,
  addCheck: addCheckItem,
  addComment: () => addComment(currentUserName()),
  deleteTask: deleteCurrentTask,
  addMember,
  clearLog,
  signIn,
  signOut,
  openTask: (el) => openTaskModal(el.dataset.id),
  removeMember: (el) => removeMember(el.dataset.name),
  toggleCheck: (el) => toggleCheckItem(Number(el.dataset.idx)),
  remCheck: (el) => remCheck(Number(el.dataset.idx)),
  removeAttach: (el) => removeAttachment(Number(el.dataset.idx)),
  closeModal: (el) => closeModal(el.dataset.target),
  tagMenu: (el) => toggleTagMenu(el.dataset.target),
  addTag: (el) => addTag(el.dataset.target, el.dataset.tag, el.dataset.meta === 'true')
};

// Handlers receive (element, event) — importData reads event.target.files, so
// it needs the event, not the element.
const changeActions = {
  taskStatus: updateTaskStatus,
  taskMeta: updateTaskMeta,
  filterMember: renderKanban,
  importFile: (_el, e) => importData(e),
  attachFile: (el) => recordLocalFile(el)
};

function installEventHandlers() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (el) {
      const fn = clickActions[el.dataset.action];
      if (fn) fn(el, e);
    }
    // Close any open tag menu when clicking outside of one.
    if (!e.target.closest('.tag-wrapper')) {
      document.querySelectorAll('.tag-menu').forEach((m) => m.classList.remove('show'));
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el) return;
    const fn = changeActions[el.dataset.change];
    if (fn) fn(el, e);
  });

  // Keyword and tag filters debounce so large boards stay responsive.
  ['s-text', 's-tag'].forEach((id) => $(id).addEventListener('input', debouncedRenderKanban));

  ['new-check-item', 'new-comment'].forEach((id) => {
    $(id).addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (id === 'new-check-item') addCheckItem();
      else addComment(currentUserName());
    });
  });

  document.querySelectorAll('.task-list').forEach((list) => {
    list.addEventListener('dragover', allowDrop);
    list.addEventListener('dragleave', clearDropHint);
    list.addEventListener('drop', drop);
  });

  document.addEventListener('keydown', (e) => {
    if (!e.key) return;
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal.active').forEach((m) => closeModal(m.id));
      return;
    }
    // 'N' used to fire with a modal open, focusing the field behind the
    // overlay and fighting the focus trap.
    if (document.querySelector('.modal.active')) return;
    if (e.key.toLowerCase() === 'n' && !e.target.matches('input,textarea,select')) {
      e.preventDefault();
      switchView('kanban');
      $('t-name').focus();
    }
  });
}

/* ---------- boot ---------- */

async function boot() {
  setStorageErrorHandler(() =>
    alert(pick('儲存失敗：瀏覽器空間不足或被封鎖', 'Save failed: storage quota exceeded or blocked'))
  );
  applyStoredTheme();
  applyLanguage();
  installEventHandlers();
  installUnloadHandler();

  await useAdapter(createLocalAdapter());
  reconcileTimersOnBoot();

  // Re-render whatever view is showing whenever state changes.
  subscribe(() => {
    if (currentView === 'kanban') renderKanban();
    else if (currentView === 'calendar') renderCalendar();
  });

  renderMemberSelects();
  renderKanban();
  $('t-end').valueAsDate = new Date();

  // Auth is optional: if it isn't configured the app stays on localStorage.
  initAuth({ onAdapterChange: useAdapter }).catch((e) => console.warn('[auth] disabled', e));

  console.info(`[boot] ${getTasks().length} task(s) loaded — ${t('view_kanban')}`);
}

boot();
