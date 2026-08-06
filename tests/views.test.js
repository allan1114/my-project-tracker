import { describe, it, expect, beforeEach } from 'vitest';
import { filterTasks, sortByPriority } from '../src/views/kanban.js';
import { bucketByDueDate } from '../src/views/calendar.js';
import { statusCounts } from '../src/views/dashboard.js';
import { migrateV12 } from '../src/storage/local.js';
import { normalizeTask } from '../src/util/task.js';

const task = (over) => normalizeTask({ name: 'x', ...over });

describe('filterTasks', () => {
  const tasks = [
    task({ name: 'Fix login bug', assignee: 'Dana', tags: ['🐛 Bug'] }),
    task({ name: 'Design header', assignee: 'Ola', tags: ['🎨 Design'] }),
    task({ name: 'Bug triage', assignee: '', tags: [] })
  ];

  it('matches names case-insensitively on a substring', () => {
    expect(filterTasks(tasks, { text: 'bug', member: '', tag: '' })).toHaveLength(2);
    expect(filterTasks(tasks, { text: 'BUG', member: '', tag: '' })).toHaveLength(2);
  });

  it('filters by exact assignee', () => {
    expect(filterTasks(tasks, { text: '', member: 'Dana', tag: '' })).toHaveLength(1);
    expect(filterTasks(tasks, { text: '', member: 'Nobody', tag: '' })).toHaveLength(0);
  });

  it('matches a tag substring', () => {
    expect(filterTasks(tasks, { text: '', member: '', tag: 'design' })).toHaveLength(1);
  });

  it('combines predicates conjunctively', () => {
    expect(filterTasks(tasks, { text: 'bug', member: 'Dana', tag: '' })).toHaveLength(1);
    expect(filterTasks(tasks, { text: 'bug', member: 'Ola', tag: '' })).toHaveLength(0);
  });

  it('returns everything when no filter is set', () => {
    expect(filterTasks(tasks, { text: '', member: '', tag: '' })).toHaveLength(3);
  });

  it('does not throw on a task with no tags', () => {
    expect(() => filterTasks([task({ tags: undefined })], { text: '', member: '', tag: 'a' })).not.toThrow();
  });
});

describe('sortByPriority', () => {
  it('orders High before Medium before Low', () => {
    const input = [task({ name: 'l', priority: 'Low' }), task({ name: 'h', priority: 'High' }), task({ name: 'm', priority: 'Medium' })];
    expect(sortByPriority(input).map((t) => t.name)).toEqual(['h', 'm', 'l']);
  });

  it('does not mutate the input array', () => {
    const input = [task({ name: 'l', priority: 'Low' }), task({ name: 'h', priority: 'High' })];
    sortByPriority(input);
    expect(input.map((t) => t.name)).toEqual(['l', 'h']);
  });
});

describe('bucketByDueDate', () => {
  it('groups tasks under their due date in one pass', () => {
    const map = bucketByDueDate([
      task({ name: 'a', end: '2026-08-06' }),
      task({ name: 'b', end: '2026-08-06' }),
      task({ name: 'c', end: '2026-08-07' })
    ]);
    expect(map.get('2026-08-06')).toHaveLength(2);
    expect(map.get('2026-08-07')).toHaveLength(1);
  });

  it('omits tasks with no due date', () => {
    const map = bucketByDueDate([task({ name: 'a', end: '' })]);
    expect(map.size).toBe(0);
  });
});

describe('statusCounts', () => {
  it('counts per status in board order', () => {
    const tasks = [
      task({ status: 'todo' }), task({ status: 'todo' }),
      task({ status: 'done' }), task({ status: 'blocked' })
    ];
    expect(statusCounts(tasks)).toEqual([2, 0, 0, 1, 1]);
  });
});

describe('migrateV12', () => {
  beforeEach(() => localStorage.clear());

  it('reports nothing to do when no v12 keys exist', () => {
    const out = migrateV12([task({ id: 'a', name: 'a' })], ['Me']);
    expect(out.touched).toBe(false);
    expect(out.tasks).toHaveLength(1);
  });

  it('merges v12 tasks that are not already present', () => {
    localStorage.setItem('v12_tasks', JSON.stringify([{ id: 'old1', name: 'Legacy' }]));
    const out = migrateV12([task({ id: 'a', name: 'a' })], ['Me']);
    expect(out.touched).toBe(true);
    expect(out.tasks).toHaveLength(2);
    expect(out.tasks[1].name).toBe('Legacy');
  });

  it('does not duplicate a task that already migrated', () => {
    localStorage.setItem('v12_tasks', JSON.stringify([{ id: 'a', name: 'Dupe' }]));
    const out = migrateV12([task({ id: 'a', name: 'Existing' })], ['Me']);
    expect(out.tasks).toHaveLength(1);
    expect(out.tasks[0].name).toBe('Existing');
  });

  it('normalizes legacy rows on the way in', () => {
    localStorage.setItem('v12_tasks', JSON.stringify([{ id: 'old1', name: 'L', status: 'weird' }]));
    expect(migrateV12([], []).tasks[0].status).toBe('todo');
  });

  it('merges v12 members without duplicating', () => {
    localStorage.setItem('v12_members', JSON.stringify(['Me', 'Dana']));
    const out = migrateV12([], ['Me']);
    expect(out.members).toEqual(['Me', 'Dana']);
  });

  it('clears the v12 keys so the merge runs only once', () => {
    localStorage.setItem('v12_tasks', JSON.stringify([{ id: 'x', name: 'X' }]));
    migrateV12([], []);
    expect(localStorage.getItem('v12_tasks')).toBeNull();
  });
});
