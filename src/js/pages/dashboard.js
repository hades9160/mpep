// ============================================================================
// DASHBOARD — workforce totals + charts for the selected reporting month.
// ============================================================================
import { supabase } from '../supabaseClient.js';
import { Chart } from 'chart.js';
import { store } from '../store.js';
import { toast, monthLabel, toDateStr } from '../utils.js';

let statusChartInstance, categoryChartInstance, trendChartInstance, regularTrendChartInstance;

export async function loadDashboard() {
  // Workforce totals — from the master Employees list, not scoped to a month.
  const totalProbationary = store.employees.filter(e => e.employment_type === 'Probationary').length;
  const totalRegular = store.employees.filter(e => e.employment_type === 'Regular').length;
  document.getElementById('workforceKpiGrid').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Total Employees</div><div class="kpi-value">${store.employees.length}</div></div>
    <div class="kpi-card yellow"><div class="kpi-label">Probationary</div><div class="kpi-value">${totalProbationary}</div></div>
    <div class="kpi-card green"><div class="kpi-label">Regular</div><div class="kpi-value">${totalRegular}</div></div>
  `;
  document.getElementById('dashMonthLabel').textContent = monthLabel(store.selectedMonth);

  const { data: evals, error } = await supabase
    .from('evaluations').select('*')
    .eq('reporting_month', store.selectedMonth);
  if (error) { toast(error.message, 'error'); return; }

  const counts = { onTrack: 0, needsImprovement: 0, failed: 0, pip: 0, forReview: 0, completed: 0 };
  evals.forEach(e => {
    if (['Passed', 'Satisfactory'].includes(e.evaluation_result)) counts.onTrack++;
    else if (e.evaluation_result === 'Needs Improvement') counts.needsImprovement++;
    else if (e.evaluation_result === 'Failed') counts.failed++;
    else if (e.evaluation_result === 'PIP') counts.pip++;
    else if (e.evaluation_result === 'For Review') counts.forReview++;
    else if (e.evaluation_result === 'Completed') counts.completed++;
  });

  // Status donut
  const statusCtx = document.getElementById('statusChart');
  if (statusChartInstance) statusChartInstance.destroy();
  statusChartInstance = new Chart(statusCtx, {
    type: 'doughnut',
    data: {
      labels: ['On Track', 'Needs Improvement', 'Failed', 'PIP / Action Plan', 'For Review', 'Completed'],
      datasets: [{
        data: [counts.onTrack, counts.needsImprovement, counts.failed, counts.pip, counts.forReview, counts.completed],
        backgroundColor: ['#2E9E5B', '#E0A800', '#D8473C', '#3576D8', '#94A0B2', '#0B1F3A'],
        borderWidth: 0,
      }]
    },
    options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, cutout: '62%' }
  });

  // Category bar (Probationary vs Regular — evaluated this month)
  const probEvalCount = evals.filter(e => e.employment_type === 'Probationary').length;
  const regEvalCount = evals.filter(e => e.employment_type === 'Regular').length;
  const catCtx = document.getElementById('categoryChart');
  if (categoryChartInstance) categoryChartInstance.destroy();
  categoryChartInstance = new Chart(catCtx, {
    type: 'bar',
    data: {
      labels: ['Probationary', 'Regular'],
      datasets: [{ label: 'Employees Evaluated', data: [probEvalCount, regEvalCount], backgroundColor: ['#F5A623', '#122A4D'], borderRadius: 6 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });

  await loadTrendChart();
  loadRegularTrendChart();
}

async function loadTrendChart() {
  const now = new Date(store.selectedMonth + 'T00:00:00');
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(toDateStr(d));
  }
  const { data, error } = await supabase
    .from('evaluations').select('reporting_month, evaluation_result')
    .in('reporting_month', months);
  if (error) { toast(error.message, 'error'); return; }

  const completed = months.map(m => data.filter(d => d.reporting_month === m && d.evaluation_result === 'Completed').length);
  const needsImp = months.map(m => data.filter(d => d.reporting_month === m && d.evaluation_result === 'Needs Improvement').length);
  const failed = months.map(m => data.filter(d => d.reporting_month === m && d.evaluation_result === 'Failed').length);
  const labels = months.map(m => new Date(m + 'T00:00:00').toLocaleString('en-US', { month: 'short', year: '2-digit' }));

  const ctx = document.getElementById('trendChart');
  if (trendChartInstance) trendChartInstance.destroy();
  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Completed', data: completed, borderColor: '#2E9E5B', backgroundColor: '#2E9E5B', tension: 0.3 },
        { label: 'Needs Improvement', data: needsImp, borderColor: '#E0A800', backgroundColor: '#E0A800', tension: 0.3 },
        { label: 'Failed', data: failed, borderColor: '#D8473C', backgroundColor: '#D8473C', tension: 0.3 },
      ]
    },
    options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });
}

// "How many Regular employees do we have, month by month" — approximated
// from current Regular employees' Date Hired (we don't track a separate
// regularization date), so this reads as workforce headcount growth rather
// than a historical log of exactly when each person was regularized.
function loadRegularTrendChart() {
  const now = new Date(store.selectedMonth + 'T00:00:00');
  const months = [];
  for (let i = 5; i >= 0; i--) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  const regularEmployees = store.employees.filter(e => e.employment_type === 'Regular' && e.date_hired);

  const counts = months.map(m => {
    const cutoff = new Date(m.getFullYear(), m.getMonth() + 1, 0); // end of that month
    return regularEmployees.filter(e => new Date(e.date_hired + 'T00:00:00') <= cutoff).length;
  });
  const labels = months.map(m => m.toLocaleString('en-US', { month: 'short', year: '2-digit' }));

  const ctx = document.getElementById('regularTrendChart');
  if (regularTrendChartInstance) regularTrendChartInstance.destroy();
  regularTrendChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Regular Employees', data: counts, backgroundColor: '#2E9E5B', borderRadius: 6 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });
}
