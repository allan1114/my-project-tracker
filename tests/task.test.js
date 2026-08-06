import { describe, it, expect } from 'vitest';
import {
  normalizeTask, finalizeTimer, elapsedSeconds, formatDuration,
  isOverdue, newId, STATUSES
} from '../src/util/task.js';

describe('normalizeTask', () => {
  it('rejects input that is not a plain object', () => {
    expect(normalizeTask(null)).toBeNull();
    expect(normalizeTask(42)).toBeNull();
    expect(normalizeTask('task')).toBeNull();
    expect(normalizeTask([])).toBeNull();
  });

  it('coerces an unrecognized status to todo', () => {
    // The renderer indexes the DOM by status; an unknown one used to hand
    // getElementById null and blank the entire board.
    expect(normalizeTask({ name: 'x', status: 'garbage' }).status).toBe('todo');
    expect(normalizeTask({ name: 'x' }).status).toBe('todo');
    STATUSES.forEach((s) => {
      expect(normalizeTask({ name: 'x', status: s }).status).toBe(s);
    });
  });

  it('coerces an unrecognized priority to Medium', () => {
    expect(normalizeTask({ name: 'x', priority: 'CRITICAL' }).priority).toBe('Medium');
    expect(normalizeTask({ name: 'x', priority: 'High' }).priority).toBe('High');
  });

  it('drops a malformed due date rather than rendering it', () => {
    expect(normalizeTask({ name: 'x', end: '2026-03-04' }).end).toBe('2026-03-04');
    expect(normalizeTask({ name: 'x', end: 'next tuesday' }).end).toBe('');
    expect(normalizeTask({ name: 'x', end: 12345 }).end).toBe('');
  });

  it('substitutes a placeholder for a missing name', () => {
    expect(normalizeTask({}).name).toBe('(untitled)');
    expect(normalizeTask({ name: '   ' }).name).toBe('   ');
  });

  it('clamps an overlong name', () => {
    expect(normalizeTask({ name: 'z'.repeat(500) }).name).toHaveLength(200);
  });

  it('filters non-object entries out of every child collection', () => {
    const t = normalizeTask({
      name: 'x',
      tags: ['ok', null, 42, ''],
      checklist: [{ text: 'a', done: true }, null, 'nope'],
      comments: [{ text: 'hi', author: 'Me' }, undefined],
      attachments: [{ name: 'f', url: 'https://e.com', type: 'link' }, 7]
    });
    expect(t.tags).toEqual(['ok']);
    expect(t.checklist).toEqual([{ text: 'a', done: true }]);
    expect(t.comments).toHaveLength(1);
    expect(t.attachments).toHaveLength(1);
  });

  it('replaces a non-array child collection with an empty array', () => {
    const t = normalizeTask({ name: 'x', tags: 'bug', checklist: {}, comments: 5 });
    expect(t.tags).toEqual([]);
    expect(t.checklist).toEqual([]);
    expect(t.comments).toEqual([]);
  });

  it('generates an id when one is missing', () => {
    expect(normalizeTask({ name: 'x' }).id).toMatch(/^t/);
    expect(normalizeTask({ name: 'x', id: 'keepme' }).id).toBe('keepme');
  });

  it('refuses to mark a timer running without a usable start stamp', () => {
    // Otherwise the display computes Date.now() - undefined and shows NaN.
    const t = normalizeTask({ name: 'x', timer: { totalSeconds: 5, isRunning: true } });
    expect(t.timer.isRunning).toBe(false);
    expect(t.timer.totalSeconds).toBe(5);

    const ok = normalizeTask({ name: 'x', timer: { totalSeconds: 5, isRunning: true, lastStartTime: 1000 } });
    expect(ok.timer.isRunning).toBe(true);
  });

  it('clamps a negative or non-numeric timer to zero', () => {
    expect(normalizeTask({ name: 'x', timer: { totalSeconds: -50 } }).timer.totalSeconds).toBe(0);
    expect(normalizeTask({ name: 'x', timer: { totalSeconds: 'abc' } }).timer.totalSeconds).toBe(0);
  });
});

describe('newId', () => {
  it('does not collide across rapid successive calls', () => {
    // 't' + Date.now() collided whenever two tasks were created in the same
    // millisecond, which clone did trivially.
    const ids = new Set();
    for (let i = 0; i < 5000; i++) ids.add(newId());
    expect(ids.size).toBe(5000);
  });
});

describe('finalizeTimer', () => {
  it('credits only the elapsed interval up to the given moment', () => {
    const start = 1_000_000;
    const t = { timer: { totalSeconds: 10, isRunning: true, lastStartTime: start } };
    expect(finalizeTimer(t, start + 5000)).toBe(true);
    expect(t.timer.totalSeconds).toBe(15);
    expect(t.timer.isRunning).toBe(false);
    expect(t.timer.lastStartTime).toBeUndefined();
  });

  it('excludes time the app spent closed', () => {
    // The heartbeat is the cutoff: a timer left running when the tab closed
    // must not be billed for the hours until the next visit.
    const start = 1_000_000;
    const heartbeat = start + 30_000; // last seen 30s after starting
    const nextVisit = start + 86_400_000; // a day later
    const t = { timer: { totalSeconds: 0, isRunning: true, lastStartTime: start } };

    finalizeTimer(t, heartbeat);
    expect(t.timer.totalSeconds).toBe(30);
    expect(t.timer.totalSeconds).toBeLessThan((nextVisit - start) / 1000);
  });

  it('never subtracts time when the cutoff precedes the start', () => {
    const t = { timer: { totalSeconds: 100, isRunning: true, lastStartTime: 5000 } };
    finalizeTimer(t, 1000);
    expect(t.timer.totalSeconds).toBe(100);
  });

  it('treats a missing start stamp as zero elapsed', () => {
    const t = { timer: { totalSeconds: 42, isRunning: true } };
    finalizeTimer(t, Date.now());
    expect(t.timer.totalSeconds).toBe(42);
    expect(t.timer.isRunning).toBe(false);
  });

  it('reports no change for a stopped or absent timer', () => {
    expect(finalizeTimer({ timer: { totalSeconds: 5, isRunning: false } }, 1)).toBe(false);
    expect(finalizeTimer({}, 1)).toBe(false);
    expect(finalizeTimer(null, 1)).toBe(false);
  });
});

describe('elapsedSeconds', () => {
  it('adds the in-flight interval while running', () => {
    const t = { timer: { totalSeconds: 10, isRunning: true, lastStartTime: 1000 } };
    expect(elapsedSeconds(t, 4000)).toBe(13);
  });

  it('returns the banked total when stopped', () => {
    expect(elapsedSeconds({ timer: { totalSeconds: 10, isRunning: false } }, 9e9)).toBe(10);
  });

  it('never returns NaN for a running timer with no start stamp', () => {
    const t = { timer: { totalSeconds: 7, isRunning: true } };
    expect(elapsedSeconds(t, 5000)).toBe(7);
    expect(Number.isNaN(elapsedSeconds(t, 5000))).toBe(false);
  });

  it('returns zero for a task with no timer', () => {
    expect(elapsedSeconds({})).toBe(0);
    expect(elapsedSeconds(null)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('renders hours, minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0h 0m 0s');
    expect(formatDuration(3661)).toBe('1h 1m 1s');
    expect(formatDuration(-5)).toBe('0h 0m 0s');
  });
});

describe('isOverdue', () => {
  const today = '2026-08-06';
  it('flags an unfinished task past its due date', () => {
    expect(isOverdue({ status: 'todo', end: '2026-08-05' }, today)).toBe(true);
  });
  it('does not flag a completed task', () => {
    expect(isOverdue({ status: 'done', end: '2020-01-01' }, today)).toBe(false);
  });
  it('does not flag today or a task with no due date', () => {
    expect(isOverdue({ status: 'todo', end: today }, today)).toBe(false);
    expect(isOverdue({ status: 'todo', end: '' }, today)).toBe(false);
  });
});
