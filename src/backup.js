/** JSON backup export and import. */

import { clampStr, localDateStr } from './util/dom.js';
import { normalizeTask, MAX_NAME_LEN } from './util/task.js';
import { pick } from './i18n.js';
import {
  getTasks, getMembers, getActivities,
  replaceTasks, setMembers, setActivities, logActivity
} from './state.js';

export function buildBackup() {
  return {
    version: 14,
    exportedAt: new Date().toISOString(),
    tasks: getTasks(),
    members: getMembers(),
    activities: getActivities()
  };
}

export function exportData() {
  const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_v14_${localDateStr()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Parse a backup payload into clean state.
 *
 * Throws on input that isn't a recognizable backup. Individual malformed tasks
 * are dropped rather than trusted — an unvalidated status used to blank the
 * whole board on the next render.
 */
export function parseBackup(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not an object');
  if (!Array.isArray(raw.tasks) && !Array.isArray(raw.members)) throw new Error('no tasks or members');

  const tasks = Array.isArray(raw.tasks) ? raw.tasks.map(normalizeTask).filter(Boolean) : null;
  const skipped = Array.isArray(raw.tasks) ? raw.tasks.length - tasks.length : 0;

  const members = Array.isArray(raw.members)
    ? raw.members.filter((m) => typeof m === 'string' && m).map((m) => clampStr(m, MAX_NAME_LEN))
    : null;

  // Export has always written activities; import used to throw them away.
  const activities = Array.isArray(raw.activities)
    ? raw.activities
        .filter((a) => a && typeof a === 'object' && typeof a.msg === 'string')
        .slice(0, 50)
        .map((a) => ({ msg: clampStr(a.msg, 500), time: clampStr(a.time, 64) }))
    : null;

  return { tasks, members, activities, skipped };
}

export function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = parseBackup(JSON.parse(ev.target.result));
      if (parsed.tasks) replaceTasks(parsed.tasks);
      if (parsed.members) setMembers(parsed.members);
      if (parsed.activities) setActivities(parsed.activities);
      if (parsed.skipped > 0) console.warn(`[import] skipped ${parsed.skipped} unreadable task(s)`);

      logActivity(`⬆️ Imported ${getTasks().length} task(s) from ${clampStr(file.name, 80)}`);
      alert(pick('已還原!', 'Restored!'));
    } catch (err) {
      console.error('[import] failed', err);
      alert(pick('匯入失敗：檔案格式錯誤', 'Import failed: invalid or unrecognized backup file'));
    } finally {
      event.target.value = ''; // allow re-import of the same file
    }
  };
  reader.onerror = () => alert(pick('讀取檔案失敗', 'File read failed'));
  reader.readAsText(file);
}
