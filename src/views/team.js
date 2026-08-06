/** Team member management and the assignee dropdowns fed from it. */

import { $, escapeHtml, clampStr, trapFocus } from '../util/dom.js';
import { MAX_NAME_LEN } from '../util/task.js';
import { t, pick } from '../i18n.js';
import {
  getMembers, getTasks, addMember as addMemberToState,
  removeMember as removeMemberFromState, logActivity, commit
} from '../state.js';
import { refreshAssigneeOptions } from './task-modal.js';

export function renderTeamList() {
  $('team-list-display').innerHTML = getMembers()
    .map(
      (m) =>
        `<button class="member-chip" data-action="removeMember" data-name="${escapeHtml(m)}" aria-label="Remove ${escapeHtml(m)}">${escapeHtml(m)} ×</button>`
    )
    .join('');
}

export function renderMemberSelects() {
  const members = getMembers();
  const opts =
    `<option value="">${escapeHtml(t('unassigned'))}</option>` +
    members.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');

  $('t-assignee').innerHTML = opts;
  refreshAssigneeOptions(opts);

  // Preserve the active filter across a re-render, otherwise adding a member
  // silently resets the board filter to "all".
  const filter = $('s-member');
  const prev = filter.value;
  filter.innerHTML =
    `<option value="">${escapeHtml(t('all_members'))}</option>` +
    members.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  if (members.includes(prev)) filter.value = prev;
}

export function openTeamModal() {
  renderTeamList();
  const m = $('teamModal');
  m.classList.add('active');
  trapFocus(m);
}

export function addMember() {
  const input = $('new-member-name');
  const v = clampStr(input.value.trim(), MAX_NAME_LEN);
  if (!addMemberToState(v)) return;
  logActivity(`👥 Member added: "${v}"`);
  renderTeamList();
  renderMemberSelects();
  input.value = '';
}

export function removeMember(name) {
  if (!confirm(pick(`移除隊員「${name}」？`, `Remove member "${name}"?`))) return;

  // Tasks assigned to a removed member would otherwise keep a dangling name
  // that the task modal quietly overwrites with "" on the next edit.
  const assigned = getTasks().filter((task) => task.assignee === name);
  if (assigned.length) {
    const msg = pick(
      `${assigned.length} 個任務由「${name}」負責。\n\n[確定] 取消指派這些任務\n[取消] 保留指派（顯示為「已移除」）`,
      `${assigned.length} task(s) are assigned to "${name}".\n\n[OK] Unassign them\n[Cancel] Keep the assignment (shown as "removed")`
    );
    if (confirm(msg)) {
      assigned.forEach((task) => {
        task.assignee = '';
      });
      commit();
    }
  }

  removeMemberFromState(name);
  logActivity(`👥 Member removed: "${name}"`);
  renderTeamList();
  renderMemberSelects();
}
