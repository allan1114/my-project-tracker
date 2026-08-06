/**
 * Postgres storage adapter (Supabase).
 *
 * Authentication is Firebase; Supabase accepts the Firebase ID token via its
 * third-party auth integration, so every query runs under RLS policies that
 * compare `auth.jwt() ->> 'sub'` to the row's owner_uid. The client never sends
 * owner_uid for filtering — the database enforces it — but we set it on insert
 * because the `with check` clause requires it to match.
 *
 * The schema is normalized (see supabase/migrations/0001_init.sql) while the
 * app works with denormalized task objects, so this module owns the mapping in
 * both directions.
 */

import { createClient } from '@supabase/supabase-js';
import { getIdToken } from '../auth/firebase.js';
import { normalizeTask } from '../util/task.js';

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* ---------- row <-> task mapping ---------- */

function rowToTask(row, membersById) {
  return normalizeTask({
    id: row.id,
    name: row.name,
    status: row.status,
    priority: row.priority,
    assignee: row.assignee_id ? membersById.get(row.assignee_id) || '' : '',
    end: row.due_date || '',
    img: row.img_url || '',
    desc: row.description || '',
    tags: (row.task_tags || []).map((t) => t.tag),
    checklist: (row.checklist_items || [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ text: i.text, done: i.done })),
    comments: (row.comments || [])
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((c) => ({ text: c.body, author: c.author_name, time: c.created_at })),
    attachments: (row.attachments || []).map((a) => ({ name: a.name, url: a.url, type: a.kind })),
    timer: { totalSeconds: row.timer_seconds || 0, isRunning: false }
  });
}

function taskToRow(task, uid, memberIdByName, position) {
  return {
    // Ids are the app's own 't<uuid>' strings; the schema stores them as text
    // so no rewriting is needed in either direction.
    id: task.id,
    owner_uid: uid,
    name: task.name,
    status: task.status,
    priority: task.priority,
    assignee_id: memberIdByName.get(task.assignee) ?? null,
    due_date: task.end || null,
    img_url: task.img || null,
    description: task.desc || '',
    timer_seconds: task.timer?.totalSeconds || 0,
    position,
    updated_at: new Date().toISOString()
  };
}

/** Only the fields that decide whether a row needs rewriting. */
function taskFingerprint(t) {
  return JSON.stringify([
    t.name, t.status, t.priority, t.assignee, t.end, t.img, t.desc,
    t.tags, t.checklist, t.comments, t.attachments, t.timer?.totalSeconds
  ]);
}

/* ---------- adapter ---------- */

export async function createSupabaseAdapter(user) {
  if (!URL_ || !ANON_KEY) throw new Error('Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');

  const uid = user.uid;
  const client = createClient(URL_, ANON_KEY, {
    // Third-party auth: every request carries the Firebase ID token, and RLS
    // reads the Firebase UID out of its `sub` claim.
    accessToken: async () => (await getIdToken()) ?? '',
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // Last-written shape per task id, so saveTasks can write only what changed
  // instead of replacing every row on each keystroke.
  let fingerprints = new Map();
  let memberIdByName = new Map();
  let membersById = new Map();

  function check({ error }) {
    if (error) throw new Error(error.message);
  }

  async function loadMembers() {
    const { data, error } = await client.from('members').select('id, name').order('created_at');
    if (error) throw new Error(error.message);
    memberIdByName = new Map(data.map((m) => [m.name, m.id]));
    membersById = new Map(data.map((m) => [m.id, m.name]));
    return data.map((m) => m.name);
  }

  async function writeChildren(taskId, task) {
    // Child rows are small and bounded; replacing them is simpler and less
    // error-prone than diffing, and happens only for tasks that actually changed.
    await Promise.all([
      client.from('task_tags').delete().eq('task_id', taskId),
      client.from('checklist_items').delete().eq('task_id', taskId),
      client.from('attachments').delete().eq('task_id', taskId),
      client.from('comments').delete().eq('task_id', taskId)
    ]);

    const jobs = [];
    if (task.tags?.length) {
      jobs.push(client.from('task_tags').insert(task.tags.map((tag) => ({ task_id: taskId, tag }))));
    }
    if (task.checklist?.length) {
      jobs.push(
        client.from('checklist_items').insert(
          task.checklist.map((i, position) => ({ task_id: taskId, text: i.text, done: i.done, position }))
        )
      );
    }
    if (task.attachments?.length) {
      jobs.push(
        client.from('attachments').insert(
          task.attachments.map((a) => ({ task_id: taskId, name: a.name, url: a.url || '', kind: a.type }))
        )
      );
    }
    if (task.comments?.length) {
      jobs.push(
        client.from('comments').insert(
          task.comments.map((c) => ({
            task_id: taskId,
            author_uid: uid,
            author_name: c.author,
            body: c.text
          }))
        )
      );
    }
    (await Promise.all(jobs)).forEach(check);
  }

  return {
    id: 'supabase',
    isCloud: true,
    uid,

    async load() {
      const members = await loadMembers();

      const { data, error } = await client
        .from('tasks')
        .select(
          'id, name, status, priority, assignee_id, due_date, img_url, description, timer_seconds, position,' +
            ' task_tags(tag), checklist_items(text, done, position),' +
            ' comments(body, author_name, created_at), attachments(name, url, kind)'
        )
        .order('position');
      if (error) throw new Error(error.message);

      const tasks = data.map((row) => rowToTask(row, membersById));
      fingerprints = new Map(tasks.map((t) => [t.id, taskFingerprint(t)]));

      const { data: acts, error: actErr } = await client
        .from('activities')
        .select('message, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (actErr) throw new Error(actErr.message);

      return {
        tasks,
        members,
        activities: acts.map((a) => ({ msg: a.message, time: new Date(a.created_at).toLocaleString() }))
      };
    },

    async saveTasks(tasks) {
      const seen = new Set();
      const changed = [];

      tasks.forEach((t, position) => {
        seen.add(t.id);
        const fp = taskFingerprint(t) + '|' + position;
        if (fingerprints.get(t.id) !== fp) changed.push({ task: t, position, fp });
      });

      // Rows the app no longer has were deleted locally; children cascade.
      const removed = [...fingerprints.keys()].filter((id) => !seen.has(id));
      if (removed.length) check(await client.from('tasks').delete().in('id', removed));
      removed.forEach((id) => fingerprints.delete(id));

      for (const { task, position, fp } of changed) {
        const row = taskToRow(task, uid, memberIdByName, position);
        check(await client.from('tasks').upsert(row, { onConflict: 'id' }));
        await writeChildren(row.id, task);
        fingerprints.set(task.id, fp);
      }
    },

    async saveMembers(members) {
      const existing = new Set(memberIdByName.keys());
      const incoming = new Set(members);

      const toAdd = members.filter((m) => !existing.has(m));
      const toRemove = [...existing].filter((m) => !incoming.has(m));

      if (toAdd.length) {
        check(await client.from('members').insert(toAdd.map((name) => ({ owner_uid: uid, name }))));
      }
      if (toRemove.length) {
        const ids = toRemove.map((n) => memberIdByName.get(n)).filter(Boolean);
        // tasks.assignee_id is ON DELETE SET NULL, so tasks survive.
        if (ids.length) check(await client.from('members').delete().in('id', ids));
      }
      if (toAdd.length || toRemove.length) await loadMembers();
    },

    async saveActivities(activities) {
      // The log is append-only and capped at 50, so only the newest entry can
      // be new. An empty array means the user cleared the log.
      if (!activities.length) {
        check(await client.from('activities').delete().eq('owner_uid', uid));
        return;
      }
      check(await client.from('activities').insert({ owner_uid: uid, message: activities[0].msg }));
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
      const { count, error } = await client.from('tasks').select('id', { count: 'exact', head: true });
      if (error) throw new Error(error.message);
      return (count || 0) === 0;
    }
  };
}
