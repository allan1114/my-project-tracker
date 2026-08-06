/**
 * localStorage adapter — the guest/offline backend, and the app's original
 * behaviour. Keys are unchanged from v13 so existing boards load untouched.
 */

import { safeStorageGet, safeStorageSet, storageRemove } from '../util/storage.js';
import { normalizeTask } from '../util/task.js';

export const KEYS = {
  tasks: 'v13_tasks',
  members: 'v13_members',
  activities: 'v13_activities'
};

/**
 * Merge any v12 rows not already present, then drop the v12 keys.
 * Runs once per browser; a second run finds nothing to do.
 */
export function migrateV12(currentTasks, currentMembers) {
  const v12tasks = safeStorageGet('v12_tasks', null);
  const v12members = safeStorageGet('v12_members', null);
  const tasks = [...currentTasks];
  const members = [...currentMembers];
  let touched = false;

  if (Array.isArray(v12tasks)) {
    const existing = new Set(tasks.map((t) => t?.id));
    v12tasks.forEach((t) => {
      if (!t?.id || existing.has(t.id)) return;
      const n = normalizeTask(t);
      if (n) {
        tasks.push(n);
        touched = true;
      }
    });
    storageRemove('v12_tasks');
  }
  if (Array.isArray(v12members)) {
    v12members.forEach((m) => {
      if (m && !members.includes(m)) {
        members.push(m);
        touched = true;
      }
    });
    storageRemove('v12_members');
  }
  return { tasks, members, touched };
}

export function createLocalAdapter() {
  return {
    id: 'local',
    isCloud: false,

    async load() {
      const rawTasks = safeStorageGet(KEYS.tasks, []);
      const rawMembers = safeStorageGet(KEYS.members, ['Me']);
      const rawActs = safeStorageGet(KEYS.activities, []);

      const merged = migrateV12(
        Array.isArray(rawTasks) ? rawTasks : [],
        Array.isArray(rawMembers) ? rawMembers : ['Me']
      );
      if (merged.touched) {
        safeStorageSet(KEYS.tasks, merged.tasks);
        safeStorageSet(KEYS.members, merged.members);
      }

      return {
        tasks: merged.tasks,
        members: merged.members,
        activities: Array.isArray(rawActs) ? rawActs : []
      };
    },

    async saveTasks(tasks) {
      safeStorageSet(KEYS.tasks, tasks);
    },
    async saveMembers(members) {
      safeStorageSet(KEYS.members, members);
    },
    async saveActivities(activities) {
      safeStorageSet(KEYS.activities, activities);
    }
  };
}

/** Raw snapshot of local data, used to offer a one-time upload at first sign-in. */
export function readLocalSnapshot() {
  return {
    tasks: safeStorageGet(KEYS.tasks, []),
    members: safeStorageGet(KEYS.members, []),
    activities: safeStorageGet(KEYS.activities, [])
  };
}
