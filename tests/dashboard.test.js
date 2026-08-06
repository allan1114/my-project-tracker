import { describe, it, expect } from 'vitest';
import {
  CHART_ORDER, statusCounts, workloadByAssignee, completionTrend,
  overdueTasks, doneThisWeek, totalTrackedSeconds, formatTracked
} from '../src/views/dashboard.js';
import { normalizeTask, STATUSES } from '../src/util/task.js';

const task = (over) => normalizeTask({ name: 'x', ...over });

describe('CHART_ORDER', () => {
  it('contains every status exactly once', () => {
    expect([...CHART_ORDER].sort()).toEqual([...STATUSES].sort());
  });

  it('does not place on-hold next to blocked', () => {
    // Adjacency is what CVD separation is measured on, and gold beside red is
    // the pair no in-band dark step can separate for deuteranopes.
    const i = CHART_ORDER.indexOf('onhold');
    const j = CHART_ORDER.indexOf('blocked');
    expect(Math.abs(i - j)).toBeGreaterThan(1);
  });
});

describe('workloadByAssignee', () => {
  it('splits each assignee by status', () => {
    const rows = workloadByAssignee(
      [
        task({ assignee: 'Dana', status: 'todo' }),
        task({ assignee: 'Dana', status: 'blocked' }),
        task({ assignee: 'Ola', status: 'done' })
      ],
      ['Dana', 'Ola']
    );
    const dana = rows.find(([n]) => n === 'Dana')[1];
    expect(dana.todo).toBe(1);
    expect(dana.blocked).toBe(1);
    expect(dana.done).toBe(0);
  });

  it('groups unassigned tasks under the supplied label', () => {
    const rows = workloadByAssignee([task({ assignee: '', status: 'todo' })], [], 'Unassigned');
    expect(rows[0][0]).toBe('Unassigned');
    expect(rows[0][1].todo).toBe(1);
  });

  it('omits members with no tasks so the chart has no empty rows', () => {
    const rows = workloadByAssignee([task({ assignee: 'Dana' })], ['Dana', 'Idle']);
    expect(rows.map(([n]) => n)).toEqual(['Dana']);
  });

  it('sorts busiest first', () => {
    const rows = workloadByAssignee(
      [
        task({ assignee: 'Quiet' }),
        task({ assignee: 'Busy' }),
        task({ assignee: 'Busy' }),
        task({ assignee: 'Busy' })
      ],
      ['Quiet', 'Busy']
    );
    expect(rows[0][0]).toBe('Busy');
  });

  it('buckets an unrecognized status into todo rather than dropping it', () => {
    const rows = workloadByAssignee([{ assignee: 'Dana', status: 'nonsense' }], ['Dana']);
    expect(rows[0][1].todo).toBe(1);
  });
});

describe('completionTrend', () => {
  const today = new Date(2026, 7, 6);

  it('returns one bucket per day, oldest first', () => {
    const out = completionTrend([], 30, today);
    expect(out).toHaveLength(30);
    expect(out[29].date).toBe('2026-08-06');
    expect(out[0].date).toBe('2026-07-08');
  });

  it('counts only completed tasks', () => {
    const out = completionTrend(
      [task({ status: 'done', end: '2026-08-05' }), task({ status: 'todo', end: '2026-08-05' })],
      30,
      today
    );
    expect(out.find((d) => d.date === '2026-08-05').count).toBe(1);
  });

  it('ignores completions outside the window', () => {
    const out = completionTrend([task({ status: 'done', end: '2020-01-01' })], 30, today);
    expect(out.reduce((n, d) => n + d.count, 0)).toBe(0);
  });
});

describe('overdueTasks', () => {
  const today = '2026-08-06';

  it('returns only unfinished tasks past their due date', () => {
    const out = overdueTasks(
      [
        task({ name: 'late', status: 'todo', end: '2026-08-01' }),
        task({ name: 'done late', status: 'done', end: '2026-08-01' }),
        task({ name: 'future', status: 'todo', end: '2026-09-01' })
      ],
      today
    );
    expect(out.map((t) => t.name)).toEqual(['late']);
  });

  it('computes days late and sorts worst first', () => {
    const out = overdueTasks(
      [
        task({ name: 'a', status: 'todo', end: '2026-08-04' }),
        task({ name: 'b', status: 'todo', end: '2026-07-27' })
      ],
      today
    );
    expect(out.map((t) => t.name)).toEqual(['b', 'a']);
    expect(out[0].daysLate).toBe(10);
    expect(out[1].daysLate).toBe(2);
  });

  it('returns an empty list when nothing is late', () => {
    expect(overdueTasks([task({ status: 'todo', end: '' })], today)).toEqual([]);
  });
});

describe('doneThisWeek', () => {
  const today = new Date(2026, 7, 6);

  it('counts completions in the trailing seven days inclusive', () => {
    expect(doneThisWeek([task({ status: 'done', end: '2026-08-06' })], today)).toBe(1);
    expect(doneThisWeek([task({ status: 'done', end: '2026-07-31' })], today)).toBe(1);
  });

  it('excludes completions older than the window', () => {
    expect(doneThisWeek([task({ status: 'done', end: '2026-07-30' })], today)).toBe(0);
  });

  it('excludes tasks that are not done', () => {
    expect(doneThisWeek([task({ status: 'todo', end: '2026-08-06' })], today)).toBe(0);
  });
});

describe('totalTrackedSeconds', () => {
  it('sums banked time across tasks', () => {
    expect(
      totalTrackedSeconds([
        task({ timer: { totalSeconds: 60 } }),
        task({ timer: { totalSeconds: 90 } }),
        task({})
      ])
    ).toBe(150);
  });
});

describe('formatTracked', () => {
  it('shows hours only once there is at least one', () => {
    expect(formatTracked(0)).toBe('0m');
    expect(formatTracked(90)).toBe('1m');
    expect(formatTracked(3660)).toBe('1h 1m');
  });
});

describe('statusCounts', () => {
  it('counts per status in board order', () => {
    const tasks = [task({ status: 'todo' }), task({ status: 'todo' }), task({ status: 'done' })];
    expect(statusCounts(tasks)).toEqual([2, 0, 0, 0, 1]);
  });
});
