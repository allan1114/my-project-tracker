import { describe, it, expect } from 'vitest';
import { taskToDoc, docToTask, taskFingerprint, chunk, BATCH_LIMIT } from '../src/storage/firestore.js';
import { normalizeTask } from '../src/util/task.js';

const full = normalizeTask({
  id: 'tabc',
  name: 'Ship it',
  status: 'inprogress',
  priority: 'High',
  assignee: 'Alan',
  end: '2026-09-01',
  img: 'https://example.com/cover.png',
  desc: 'A description',
  tags: ['🐛 Bug', 'urgent'],
  checklist: [{ text: 'step one', done: true }, { text: 'step two', done: false }],
  comments: [{ text: 'looks good', author: 'Alan', time: '2026-01-01' }],
  attachments: [{ name: 'spec', url: 'https://example.com/spec', type: 'link' }],
  timer: { totalSeconds: 90, isRunning: true, lastStartTime: Date.now() }
});

describe('taskToDoc / docToTask', () => {
  it('round-trips every field the board renders', () => {
    const back = docToTask('tabc', taskToDoc(full, 3));
    expect(back.id).toBe('tabc');
    expect(back.name).toBe('Ship it');
    expect(back.status).toBe('inprogress');
    expect(back.priority).toBe('High');
    expect(back.assignee).toBe('Alan');
    expect(back.end).toBe('2026-09-01');
    expect(back.img).toBe('https://example.com/cover.png');
    expect(back.desc).toBe('A description');
    expect(back.tags).toEqual(['🐛 Bug', 'urgent']);
    expect(back.checklist).toEqual([{ text: 'step one', done: true }, { text: 'step two', done: false }]);
    expect(back.comments).toEqual([{ text: 'looks good', author: 'Alan', time: '2026-01-01' }]);
    expect(back.attachments).toEqual([{ name: 'spec', url: 'https://example.com/spec', type: 'link' }]);
  });

  it('records the position it was written at', () => {
    expect(taskToDoc(full, 3).position).toBe(3);
  });

  it('banks timer seconds but never persists a running timer', () => {
    // A timer left running on one device must not keep counting on another.
    const doc = taskToDoc(full, 0);
    expect(doc.timerSeconds).toBe(90);
    expect(JSON.stringify(doc)).not.toContain('isRunning');

    const back = docToTask('tabc', doc);
    expect(back.timer.totalSeconds).toBe(90);
    expect(back.timer.isRunning).toBe(false);
  });

  it('writes no undefined values, which Firestore rejects', () => {
    const sparse = normalizeTask({ id: 't1', name: 'Bare' });
    const doc = taskToDoc(sparse, 0);
    Object.entries(doc).forEach(([key, value]) => {
      expect(value, key).not.toBeUndefined();
    });
  });

  it('normalizes a document with a bogus status instead of trusting it', () => {
    const back = docToTask('t1', { name: 'Corrupt', status: 'garbage', priority: 'Nope' });
    expect(back.status).toBe('todo');
    expect(back.priority).toBe('Medium');
  });

  it('survives a document missing every optional field', () => {
    const back = docToTask('t1', { name: 'Bare' });
    expect(back.tags).toEqual([]);
    expect(back.checklist).toEqual([]);
    expect(back.timer.totalSeconds).toBe(0);
  });
});

describe('taskFingerprint', () => {
  it('is stable for an unchanged task', () => {
    expect(taskFingerprint(full)).toBe(taskFingerprint({ ...full }));
  });

  it('changes when a rendered field changes', () => {
    const before = taskFingerprint(full);
    expect(taskFingerprint({ ...full, status: 'done' })).not.toBe(before);
    expect(taskFingerprint({ ...full, tags: ['other'] })).not.toBe(before);
    expect(taskFingerprint({ ...full, timer: { totalSeconds: 91 } })).not.toBe(before);
  });

  it('ignores the id, which never changes for a given document', () => {
    expect(taskFingerprint({ ...full, id: 'tother' })).toBe(taskFingerprint(full));
  });
});

describe('chunk', () => {
  it('returns nothing for an empty list', () => {
    expect(chunk([], BATCH_LIMIT)).toEqual([]);
  });

  it('keeps a batch-sized list in one group', () => {
    const exact = Array.from({ length: BATCH_LIMIT }, (_, i) => i);
    expect(chunk(exact, BATCH_LIMIT)).toHaveLength(1);
  });

  it('splits one item past the batch limit into two groups', () => {
    const over = Array.from({ length: BATCH_LIMIT + 1 }, (_, i) => i);
    const groups = chunk(over, BATCH_LIMIT);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(BATCH_LIMIT);
    expect(groups[1]).toHaveLength(1);
  });

  it('stays under Firestore’s 500-write batch cap', () => {
    expect(BATCH_LIMIT).toBeLessThanOrEqual(500);
  });
});
