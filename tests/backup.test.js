import { describe, it, expect } from 'vitest';
import { parseBackup } from '../src/backup.js';

describe('parseBackup', () => {
  it('rejects payloads that are not a backup object', () => {
    expect(() => parseBackup(null)).toThrow();
    expect(() => parseBackup('nope')).toThrow();
    expect(() => parseBackup([])).toThrow();
    expect(() => parseBackup({ unrelated: true })).toThrow();
  });

  it('accepts a payload with only tasks or only members', () => {
    expect(parseBackup({ tasks: [] }).tasks).toEqual([]);
    expect(parseBackup({ members: ['A'] }).members).toEqual(['A']);
  });

  it('restores activities, which import used to discard', () => {
    // exportData has always written activities; importData only read tasks
    // and members, silently dropping the audit log on every restore.
    const out = parseBackup({
      tasks: [],
      activities: [{ msg: 'did a thing', time: '2026-01-01' }]
    });
    expect(out.activities).toEqual([{ msg: 'did a thing', time: '2026-01-01' }]);
  });

  it('drops activity entries with no message', () => {
    const out = parseBackup({ tasks: [], activities: [{ time: 'x' }, { msg: 'ok', time: 'y' }] });
    expect(out.activities).toHaveLength(1);
  });

  it('caps the restored activity log at 50 entries', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ msg: `m${i}`, time: 't' }));
    expect(parseBackup({ tasks: [], activities: many }).activities).toHaveLength(50);
  });

  it('normalizes a task with a bogus status instead of trusting it', () => {
    const out = parseBackup({ tasks: [{ name: 'Corrupt', status: 'garbage' }] });
    expect(out.tasks[0].status).toBe('todo');
    expect(out.skipped).toBe(0);
  });

  it('counts unsalvageable rows as skipped rather than failing the import', () => {
    const out = parseBackup({ tasks: [{ name: 'good' }, null, 'junk', 42] });
    expect(out.tasks).toHaveLength(1);
    expect(out.skipped).toBe(3);
  });

  it('reports null for collections the payload omits, so they are left alone', () => {
    const out = parseBackup({ tasks: [{ name: 'a' }] });
    expect(out.members).toBeNull();
    expect(out.activities).toBeNull();
  });

  it('drops non-string member names', () => {
    expect(parseBackup({ members: ['A', null, 7, '', 'B'] }).members).toEqual(['A', 'B']);
  });

  it('round-trips a realistic backup', () => {
    const original = {
      version: 14,
      tasks: [
        {
          id: 't1', name: 'Ship it', status: 'inprogress', priority: 'High',
          assignee: 'Dana', end: '2026-08-06', tags: ['✨ Feature'],
          checklist: [{ text: 'write tests', done: true }],
          comments: [{ text: 'lgtm', author: 'Dana', time: 'now' }],
          attachments: [{ name: 'spec', url: 'https://e.com/s', type: 'link' }],
          timer: { totalSeconds: 120, isRunning: false }
        }
      ],
      members: ['Dana'],
      activities: [{ msg: 'created', time: 'then' }]
    };
    const out = parseBackup(JSON.parse(JSON.stringify(original)));
    expect(out.tasks[0]).toMatchObject({
      id: 't1', name: 'Ship it', status: 'inprogress', priority: 'High',
      assignee: 'Dana', end: '2026-08-06'
    });
    expect(out.tasks[0].checklist).toEqual([{ text: 'write tests', done: true }]);
    expect(out.tasks[0].timer.totalSeconds).toBe(120);
    expect(out.members).toEqual(['Dana']);
    expect(out.activities).toHaveLength(1);
  });
});
