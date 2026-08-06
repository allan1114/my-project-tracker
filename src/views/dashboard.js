/**
 * Analytics dashboard.
 *
 * Chart.js is lazy-loaded: it is by far the heaviest dependency and most
 * sessions never open this view.
 */

import { $, trapFocus } from '../util/dom.js';
import { t } from '../i18n.js';
import { getTasks, getMembers } from '../state.js';
import { STATUSES } from '../util/task.js';

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

export function statusCounts(tasks) {
  return STATUSES.map((s) => tasks.filter((task) => task.status === s).length);
}

export function workloadCounts(tasks, members) {
  const counts = {};
  members.forEach((m) => {
    counts[m] = 0;
  });
  counts[t('unassigned_short')] = 0;
  tasks.forEach((task) => {
    const key = task.assignee || t('unassigned_short');
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export async function renderCharts() {
  const Chart = await loadChart();
  if (!Chart) return;

  Object.values(charts).forEach((c) => c?.destroy());

  const tasks = getTasks();
  const statusColors = STATUSES.map((s) => cssVar(`--c-${s}`));
  const textColor = cssVar('--text-sub');

  charts.status = new Chart($('statusChart'), {
    type: 'doughnut',
    data: {
      labels: STATUSES.map((s) => t('st_' + s)),
      datasets: [{ data: statusCounts(tasks), backgroundColor: statusColors, borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: textColor } } }
    }
  });

  const workload = workloadCounts(tasks, getMembers());
  charts.member = new Chart($('memberChart'), {
    type: 'bar',
    data: {
      labels: Object.keys(workload),
      datasets: [{ label: t('kpi_total'), data: Object.values(workload), backgroundColor: cssVar('--primary') }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: textColor }, grid: { display: false } },
        y: { ticks: { color: textColor, precision: 0 }, grid: { color: cssVar('--grid-line') }, beginAtZero: true }
      }
    }
  });
}

export function openDashboard() {
  const m = $('dashboardModal');
  m.classList.add('active');
  renderCharts();
  trapFocus(m);
}

export function destroyCharts() {
  Object.keys(charts).forEach((k) => {
    charts[k]?.destroy();
    charts[k] = null;
  });
}
