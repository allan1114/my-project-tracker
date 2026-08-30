/**
 * Cloud Firestore storage adapter — the default cloud backend.
 *
 * Identity and storage both come from the same Firebase project here, so
 * unlike the Supabase adapter there is no token exchange and no third-party
 * auth configuration: the Firestore SDK reuses the signed-in Firebase app, and
 * security rules compare `request.auth.uid` to the `{uid}` segment of the path
 * (see firestore.rules).
 *
 * Layout, all nested under the owner so one rule covers everything:
 *
 *   users/{uid}/tasks/{taskId}       one document per task
 *   users/{uid}/meta/board           { members: [...] }
 *   users/{uid}/activities/{autoId}  { message, createdAt }
 *
 * Firestore is a document store, so the tags / checklist / comments /
 * attachments that Postgres keeps in child tables are just arrays on the task
 * document — well inside the 1 MiB per-document limit.
 */

import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
  writeBatch, query, orderBy, limit
} from 'firebase/firestore';
import { ensureApp } from '../auth/firebase.js';
import { normalizeTask } from '../util/task.js';

/** Firestore rejects a batch of more than 500 writes; leave headroom. */
export const BATCH_LIMIT = 450;

/** Matches MAX_ACTIVITIES in state.js — the log is capped at both ends. */
const MAX_ACTIVITIES = 50;

/* ---------- document <-> task mapping ---------- */

/**
 * Fields are written out one by one rather than spreading the task: Firestore
 * rejects `undefined`, and a stray key from a future task shape would be
 * persisted silently.
 */
export function taskToDoc(task, position) {
  return {
    name: task.name,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee || '',
    end: task.end || '',
    img: task.img || '',
    desc: task.desc || '',
    tags: task.tags || [],
    checklist: (task.checklist || []).map((i) => ({ text: i.text, done: !!i.done })),
    comments: (task.comments || []).map((c) => ({ text: c.text, author: c.author, time: c.time })),
    attachments: (task.attachments || []).map((a) => ({ name: a.name, url: a.url || '', type: a.type })),
    // isRunning is deliberately not persisted: a timer left running on one
    // device must not keep counting for a board opened on another.
    timerSeconds: task.timer?.totalSeconds || 0,
    position,
    updatedAt: Date.now()
  };
}

/** Everything read back goes through normalizeTask, same as every other source. */
export function docToTask(id, data) {
  return normalizeTask({
    id,
    name: data.name,
    status: data.status,
    priority: data.priority,
    assignee: data.assignee,
    end: data.end,
    img: data.img,
    desc: data.desc,
    tags: data.tags,
    checklist: data.checklist,
    comments: data.comments,
    attachments: data.attachments,
    timer: { totalSeconds: data.timerSeconds || 0, isRunning: false }
  });
}

/** Only the fields that decide whether a document needs rewriting. */
export function taskFingerprint(t) {
  return JSON.stringify([
    t.name, t.status, t.priority, t.assignee, t.end, t.img, t.desc,
    t.tags, t.checklist, t.comments, t.attachments, t.timer?.totalSeconds
  ]);
}

export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ---------- adapter ---------- */

export async function createFirestoreAdapter(user) {
  if (!user?.uid) throw new Error('Firestore adapter requires a signed-in user');

  const uid = user.uid;
  const db = getFirestore(ensureApp());
  const tasksCol = collection(db, 'users', uid, 'tasks');
  const actsCol = collection(db, 'users', uid, 'activities');
  const boardDoc = doc(db, 'users', uid, 'meta', 'board');

  // Last-written shape per task id, so saveTasks writes only what changed
  // instead of rewriting every document on each keystroke.
  let fingerprints = new Map();

  const fingerprintOf = (task, position) => taskFingerprint(task) + '|' + position;

  async function commitOps(ops) {
    for (const group of chunk(ops, BATCH_LIMIT)) {
      const batch = writeBatch(db);
      group.forEach((op) => {
        if (op.kind === 'delete') batch.delete(op.ref);
        else batch.set(op.ref, op.data);
      });
      await batch.commit();
    }
  }

  return {
    id: 'firestore',
    isCloud: true,
    uid,

    async load() {
      const [taskSnap, boardSnap, actSnap] = await Promise.all([
        getDocs(query(tasksCol, orderBy('position'))),
        getDoc(boardDoc),
        getDocs(query(actsCol, orderBy('createdAt', 'desc'), limit(MAX_ACTIVITIES)))
      ]);

      const tasks = taskSnap.docs.map((d) => docToTask(d.id, d.data())).filter(Boolean);
      // Seed the fingerprints so the render-triggered first save is a no-op.
      fingerprints = new Map(tasks.map((t, position) => [t.id, fingerprintOf(t, position)]));

      const board = boardSnap.exists() ? boardSnap.data() : null;
      const members = Array.isArray(board?.members)
        ? board.members.filter((m) => typeof m === 'string' && m)
        : ['Me'];

      const activities = actSnap.docs.map((d) => {
        const a = d.data();
        return {
          msg: a.message,
          time: a.createdAt ? new Date(a.createdAt).toLocaleString() : ''
        };
      });

      return { tasks, members, activities };
    },

    async saveTasks(tasks) {
      const seen = new Set();
      const ops = [];
      const nextFingerprints = new Map();

      tasks.forEach((t, position) => {
        seen.add(t.id);
        const fp = fingerprintOf(t, position);
        nextFingerprints.set(t.id, fp);
        if (fingerprints.get(t.id) !== fp) {
          ops.push({ kind: 'set', ref: doc(tasksCol, t.id), data: taskToDoc(t, position) });
        }
      });

      // Ids the app no longer has were deleted locally.
      [...fingerprints.keys()]
        .filter((id) => !seen.has(id))
        .forEach((id) => ops.push({ kind: 'delete', ref: doc(tasksCol, id) }));

      if (!ops.length) return;
      await commitOps(ops);
      fingerprints = nextFingerprints;
    },

    async saveMembers(members) {
      await setDoc(boardDoc, { members, updatedAt: Date.now() });
    },

    async saveActivities(activities) {
      // The log is append-only and capped at 50 in state.js, so only the newest
      // entry can be new. An empty array means the user cleared the log.
      if (!activities.length) {
        const snap = await getDocs(actsCol);
        await commitOps(snap.docs.map((d) => ({ kind: 'delete', ref: d.ref })));
        return;
      }
      // Client time, not a server timestamp: state.js already stamped this
      // entry with the browser's clock and showed it, so a server value would
      // disagree with what the user just saw in the log.
      await addDoc(actsCol, { message: activities[0].msg, createdAt: Date.now() });
    },

    /** Push a local snapshot into an empty cloud account (first sign-in). */
    async importSnapshot({ tasks, members }) {
      if (members?.length) await this.saveMembers(members);
      if (tasks?.length) {
        fingerprints = new Map();
        await this.saveTasks(tasks);
      }
    },

    async isEmpty() {
      const snap = await getDocs(query(tasksCol, limit(1)));
      return snap.empty;
    }
  };
}
