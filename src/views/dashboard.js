/**
 * Analytics dashboard.
 *
 * Chart.js is lazy-loaded — it is the heaviest dependency and most sessions
 * never open this view.
 *
 * Colour: the five status fills are a validated categorical palette (see
 * --c-* in styles/base.css). They are drawn in CHART_ORDER rather than board
 * order because adjacency is what colour-vision-deficiency separation is
 * measured on: in board order, on-hold gold sits next to blocked red, a pair
 * that no in-band dark step can separate for deuteranopes. The order below was
 * chosen from those that pass every check in both light and dark.
 *
 * Every chart carries a legend and direct labels, and the page ships a table
 * view, so identity is never conveyed by fill alone.
 */

import { $, escapeHtml, localDateStr } from '../util/dom.js';
import { t, localeTag } from '../i18n.js';
import { getTasks, getMembers } from '../state.js';
import { STATUSES, elapsedSeconds, isOverdue } from '../util/task.js';

/** Draw order for every status-coloured chart. Not the board's column order. */
export const CHART_ORDER = ['blocked', 'todo', 'onhold', 'inprogress', 'done'];

let ChartLib = null;
const charts = {};

async function loadChart() {
  if (ChartLib) return ChartLib;
  try {
    const mod = await import('chart.js/auto');
    ChartLib = mod.default;
  } catch (e) {
    console.warn('[dashboard] Chart.js unavailable', e);
  }
  return ChartLib;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ---------- aggregation (pure, unit-tested) ---------- */

export function statusCounts(tasks) {
  return STATUSES.map((s) => tasks.filter((task) => task.status === s).length);
}

/** Tasks per assignee, split by status. Sorted busiest-first. */
export function workloadByAssignee(tasks, members, unassignedLabel = 'Unassigned') {
  const rows = new Map();
  const blank = () => Object.fromEntries(CHART_ORDER.map((s) => [s, 0]));
  members.forEach((m) => rows.set(m, blank()));

  tasks.forEach((task) => {
    const key = task.assignee || unassignedLabel;
    if (!rows.has(key)) rows.set(key, blank());
    const status = CHART_ORDER.includes(task.status) ? task.status : 'todo';
    rows.get(key)[status]++;
  });

  const total = (r) => CHART_ORDER.reduce((n, s) => n + r[s], 0);
  return [...rows.entries()]
    .filter(([, r]) => total(r) > 0)
    .sort((a, b) => total(b[1]) - total(a[1]));
}

/** Tasks completed per day over the trailing `days` days, oldest first. */
export function completionTrend(tasks, days = 30, today = new Date()) {
  const out = [];
  const done = tasks.filter((task) => task.status === 'done');
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = localDateStr(d);
    // Completion date isn't recorded, so the due date is the best available
    // proxy. Tasks finished without a due date can't appear on this timeline.
    out.push({ date: key, count: done.filter((task) => task.end === key).length });
  }
  return out;
}

export function overdueTasks(tasks, today = localDateStr()) {
  const todayMs = new Date(today + 'T00:00:00').getTime();
  return tasks
    .filter((task) => isOverdue(task, today))
    .map((task) => ({
      ...task,
      daysLate: Math.max(1, Math.round((todayMs - new Date(task.end + 'T00:00:00').getTime()) / 86400000))
    }))
    .sort((a, b) => b.daysLate - a.daysLate);
}

export function doneThisWeek(tasks, today = new Date()) {
  const cutoff = localDateStr(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6));
  const todayStr = localDateStr(today);
  return tasks.filter((task) => task.status === 'done' && task.end && task.end >= cutoff && task.end <= todayStr).length;
}

export function totalTrackedSeconds(tasks) {
  return tasks.reduce((sum, task) => sum + elapsedSeconds(task), 0);
}

export function formatTracked(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/* ---------- render ---------- */

function renderKpis(tasks) {
  const counts = Object.fromEntries(STATUSES.map((s, i) => [s, statusCounts(tasks)[i]]));
  const overdue = overdueTasks(tasks).length;

  const tiles = [
    { label: t('kpi_total'), value: tasks.length },
    { label: t('kpi_inprogress'), value: counts.inprogress },
    { label: t('kpi_blocked'), value: counts.blocked, tone: counts.blocked > 0 ? 'alert' : '' },
    { label: t('kpi_overdue'), value: overdue, tone: overdue > 0 ? 'alert' : '' },
    { label: t('kpi_done_week'), value: doneThisWeek(tasks), tone: 'good' },
    { label: t('kpi_tracked'), value: formatTracked(totalTrackedSeconds(tasks)) }
  ];

  $('kpi-grid').innerHTML = tiles
    .map(
      (k) =>
        `<div class="kpi-tile ${k.tone || ''}"><div class="kpi-label">${escapeHtml(k.label)}</div>` +
        `<div class="kpi-value">${escapeHtml(String(k.value))}</div></div>`
    )
    .join('');
}

function renderOverdueTable(tasks) {
  const rows = overdueTasks(tasks);
  const box = $('overdue-table');
  if (!rows.length) {
    box.innerHTML = `<p class="dash-empty">${escapeHtml(t('none_overdue'))}</p>`;
    return;
  }
  box.innerHTML =
    '<div class="table-scroll"><table class="dash-table"><thead><tr>' +
    `<th>${escapeHtml(t('tbl_task'))}</th><th>${escapeHtml(t('tbl_assignee'))}</th>` +
    `<th class="num">${escapeHtml(t('tbl_days'))}</th></tr></thead><tbody>` +
    rows
      .map(
        (r) =>
          `<tr><td><span class="dot" style="background:var(--c-${r.status})"></span>` +
          `<a href="#" data-action="openTask" data-id="${escapeHtml(r.id)}">${escapeHtml(r.name)}</a></td>` +
          `<td>${escapeHtml(r.assignee || t('unassigned_short'))}</td>` +
          `<td class="num days-late">${r.daysLate}</td></tr>`
      )
      .join('') +
    '</tbody></table></div>';
}

/** Status counts as a table — the relief the contrast WARN requires. */
function renderStatusTable(tasks) {
  const counts = statusCounts(tasks);
  const byStatus = Object.fromEntries(STATUSES.map((s, i) => [s, counts[i]]));
  const total = tasks.length || 1;
  $('status-table').innerHTML =
    '<div class="table-scroll"><table class="dash-table"><tbody>' +
    CHART_ORDER.map(
      (s) =>
        `<tr><td><span class="dot" style="background:var(--c-${s})"></span>${escapeHtml(t('st_' + s))}</td>` +
        `<td class="num">${byStatus[s]}</td>` +
        `<td class="num">${Math.round((byStatus[s] / total) * 100)}%</td></tr>`
    ).join('') +
    '</tbody></table></div>';
}

async function renderCharts(tasks) {
  const Chart = await loadChart();
  if (!Chart) return;
  Object.values(charts).forEach((c) => c?.destroy());

  const ink = cssVar('--text-sub');
  const grid = cssVar('--grid-line');
  const surface = cssVar('--bg-card');
  const fills = CHART_ORDER.map((s) => cssVar(`--c-${s}`));
  const byStatus = Object.fromEntries(STATUSES.map((s, i) => [s, statusCounts(tasks)[i]]));

  // Doughnut: a 2px surface-coloured ring separates adjacent segments.
  charts.status = new Chart($('statusChart'), {
    type: 'doughnut',
    data: {
      labels: CHART_ORDER.map((s) => t('st_' + s)),
      datasets: [
        {
          data: CHART_ORDER.map((s) => byStatus[s]),
          backgroundColor: fills,
          borderColor: surface,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom', labels: { color: ink, boxWidth: 12, padding: 12 } },
        tooltip: {
          callbacks: {
            label: (c) => {
              const total = c.dataset.data.reduce((a, b) => a + b, 0) || 1;
              return ` ${c.label}: ${c.raw} (${Math.round((c.raw / total) * 100)}%)`;
            }
          }
        }
      }
    }
  });

  // Horizontal stacked bar: one row per assignee, segmented by status.
  const workload = workloadByAssignee(tasks, getMembers(), t('unassigned_short'));
  charts.workload = new Chart($('workloadChart'), {
    type: 'bar',
    data: {
      labels: workload.map(([name]) => name),
      datasets: CHART_ORDER.map((s, i) => ({
        label: t('st_' + s),
        data: workload.map(([, row]) => row[s]),
        backgroundColor: fills[i],
        borderColor: surface,
        borderWidth: { top: 0, bottom: 0, left: 1, right: 1 },
        borderRadius: 3,
        borderSkipped: false
      }))
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: ink, boxWidth: 12, padding: 12 } } },
      scales: {
        x: { stacked: true, beginAtZero: true, ticks: { color: ink, precision: 0 }, grid: { color: grid } },
        y: { stacked: true, ticks: { color: ink }, grid: { display: false } }
      }
    }
  });

  // Trend: a single series needs no legend — the heading names it.
  const trend = completionTrend(tasks);
  charts.trend = new Chart($('trendChart'), {
    type: 'bar',
    data: {
      labels: trend.map((d) => d.date.slice(5)),
      datasets: [{ label: t('st_done'), data: trend.map((d) => d.count), backgroundColor: cssVar('--c-done'), borderRadius: 3 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: ink, maxRotation: 0, autoSkipPadding: 16 }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: ink, precision: 0 }, grid: { color: grid } }
      }
    }
  });
}

export function renderDashboard() {
  const tasks = getTasks();
  renderKpis(tasks);
  renderStatusTable(tasks);
  renderOverdueTable(tasks);
  renderCharts(tasks);
  const stamp = $('dash-updated');
  if (stamp) stamp.innerText = new Date().toLocaleString(localeTag());
}

export function destroyCharts() {
  Object.keys(charts).forEach((k) => {
    charts[k]?.destroy();
    charts[k] = null;
  });
}
