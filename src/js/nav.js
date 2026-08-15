// ============================================================================
// NAVIGATION — sidebar tab switching, view dispatch, and the Reporting
// Month selector. This is the module every page's "refresh me" calls route
// through, so it necessarily imports every page's top-level loader.
// ============================================================================
import { store } from './store.js';
import { toDateStr } from './utils.js';
import { loadDashboard } from './pages/dashboard.js';
import { loadEmployeesView } from './pages/employees.js';
import { loadEvaluationsView } from './pages/evaluations.js';
import { loadHrAttention } from './pages/hrAttention.js';
import { loadThirdFifth } from './pages/thirdFifth.js';

const VIEW_TITLES = {
  dashboard:    ['Dashboard', 'Overview for the selected reporting month'],
  employees:    ['Employees', 'Master employee list'],
  probationary: ['Probationary Employees', 'Performance evaluation monitoring'],
  regular:      ['Regular Employees', 'Performance evaluation monitoring'],
  hrAttention:  ['HR Attention', 'Employees requiring HR / management attention'],
  thirdFifth:   ['3rd & 5th Month Tracker', 'Probationary regularization tracker'],
  bulkImport:   ['Bulk Import', 'Add many records at once from a spreadsheet'],
  backupRestore:['Backup & Restore', 'Download or restore a full backup of the database'],
};

export function setupNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-' + view).classList.add('active');
      document.getElementById('viewTitle').textContent = VIEW_TITLES[view][0];
      document.getElementById('viewSubtitle').textContent = VIEW_TITLES[view][1];
      document.getElementById('sidebar').classList.remove('open');
      loadView(view);
    });
  });
}

export function setupMenuToggle() {
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

export function currentView() {
  return document.querySelector('.nav-item.active').dataset.view;
}

export async function refreshCurrentView() { await loadView(currentView()); }

export async function loadView(view) {
  if (view === 'dashboard') return loadDashboard();
  if (view === 'employees') return loadEmployeesView();
  if (view === 'probationary') return loadEvaluationsView('Probationary');
  if (view === 'regular') return loadEvaluationsView('Regular');
  if (view === 'hrAttention') return loadHrAttention();
  if (view === 'thirdFifth') return loadThirdFifth();
  if (view === 'bulkImport') return; // static view, no data load needed
  if (view === 'backupRestore') return; // static view, no data load needed
}

// ---------------------------------------------------------------------------
// MONTH SELECTOR (rolling window, 12 months back to 3 months ahead)
// ---------------------------------------------------------------------------
export function populateMonthSelector() {
  const sel = document.getElementById('monthSelect');
  const now = new Date();
  const opts = [];
  for (let i = -12; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = toDateStr(d);
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    opts.push({ value, label });
  }
  sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  const currentValue = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
  sel.value = currentValue;
  store.selectedMonth = currentValue;

  sel.addEventListener('change', () => {
    store.selectedMonth = sel.value;
    refreshCurrentView();
  });
}
