// ============================================================================
// Aurion Solar — Performance Evaluation Dashboard — app logic
// ============================================================================
import { supabase } from './supabaseClient.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
import { runBulkImport } from './bulkImport.js';

let CURRENT_USER = null;
let SELECTED_MONTH = null;     // 'YYYY-MM-01'
let EMPLOYEES = [];             // cache of all employees
let editingId = null;           // id currently being edited in the modal
let editingTable = null;        // supabase table currently being edited

// ---------------------------------------------------------------------------
// AUTH GUARD
// ---------------------------------------------------------------------------
(async function init() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) { window.location.href = '/'; return; }
  CURRENT_USER = data.session.user;
  document.getElementById('userEmail').textContent = CURRENT_USER.email;

  supabase.auth.onAuthStateChange((event, session) => {
    if (!session) window.location.href = '/';
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  });

  setupNav();
  setupMenuToggle();
  populateMonthSelector();
  bindModalChrome();
  bindStaticButtons();

  await loadEmployees();
  await refreshCurrentView();
})();

// ---------------------------------------------------------------------------
// NAVIGATION
// ---------------------------------------------------------------------------
const VIEW_TITLES = {
  dashboard:    ['Dashboard', 'Overview for the selected reporting month'],
  employees:    ['Employees', 'Master employee list'],
  probationary: ['Probationary Employees', 'Performance evaluation monitoring'],
  regular:      ['Regular Employees', 'Performance evaluation monitoring'],
  hrAttention:  ['HR Attention', 'Employees requiring HR / management attention'],
  thirdFifth:   ['3rd & 5th Month Tracker', 'Probationary regularization tracker'],
  highlights:   ['Progress Highlights', 'Monthly narrative summary'],
  signoff:      ['Sign-Off', 'Report preparation and review'],
  bulkImport:   ['Bulk Import', 'Add many records at once from a spreadsheet'],
};

function setupNav() {
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

function setupMenuToggle() {
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

function currentView() {
  return document.querySelector('.nav-item.active').dataset.view;
}

async function refreshCurrentView() { await loadView(currentView()); }

async function loadView(view) {
  if (view === 'dashboard') return loadDashboard();
  if (view === 'employees') return loadEmployeesView();
  if (view === 'probationary') return loadEvaluations('Probationary');
  if (view === 'regular') return loadEvaluations('Regular');
  if (view === 'hrAttention') return loadHrAttention();
  if (view === 'thirdFifth') return loadThirdFifth();
  if (view === 'highlights') return loadHighlights();
  if (view === 'signoff') return loadSignoff();
  if (view === 'bulkImport') return; // static view, no data load needed
}

// ---------------------------------------------------------------------------
// MONTH SELECTOR (rolling window, 12 months back to 3 months ahead)
// ---------------------------------------------------------------------------
function populateMonthSelector() {
  const sel = document.getElementById('monthSelect');
  const now = new Date();
  const opts = [];
  for (let i = -12; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = d.toISOString().slice(0, 10);
    const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    opts.push({ value, label });
  }
  sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  const currentValue = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  sel.value = currentValue;
  SELECTED_MONTH = currentValue;

  sel.addEventListener('change', () => {
    SELECTED_MONTH = sel.value;
    refreshCurrentView();
  });
}

// ---------------------------------------------------------------------------
// TOAST
// ---------------------------------------------------------------------------
function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------------------
// MODAL (generic)
// ---------------------------------------------------------------------------
function bindModalChrome() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
}
function openModal(title, bodyHtml, onSave) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.add('active');
  const saveBtn = document.getElementById('modalSave');
  const newSaveBtn = saveBtn.cloneNode(true); // strip old listeners
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
  newSaveBtn.addEventListener('click', onSave);
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  editingId = null; editingTable = null;
}
function val(id) { const el = document.getElementById(id); return el ? el.value : null; }
function numOrNull(id) { const v = val(id); return v === '' || v === null ? null : Number(v); }
function strOrNull(id) { const v = val(id); return v === '' ? null : v; }

// ---------------------------------------------------------------------------
// EMPLOYEES
// ---------------------------------------------------------------------------
async function loadEmployees() {
  const { data, error } = await supabase.from('employees').select('*').order('name');
  if (error) { toast(error.message, 'error'); return; }
  EMPLOYEES = data || [];
}

function employeeOptions(type) {
  return EMPLOYEES
    .filter(e => !type || e.employment_type === type)
    .map(e => `<option value="${e.id}">${escapeHtml(e.name)} — ${escapeHtml(e.position || '')}</option>`)
    .join('');
}

async function loadEmployeesView() {
  renderEmployeesTable();
}
function renderEmployeesTable() {
  const search = (document.getElementById('empSearch').value || '').toLowerCase();
  const typeFilter = document.getElementById('empTypeFilter').value;
  const rows = EMPLOYEES.filter(e =>
    (!typeFilter || e.employment_type === typeFilter) &&
    (!search || e.name.toLowerCase().includes(search))
  );
  const tbody = document.getElementById('employeesTbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No employees yet. Click "Add Employee" to get started.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(e => `
    <tr>
      <td><strong>${escapeHtml(e.name)}</strong></td>
      <td>${escapeHtml(e.position || '—')}</td>
      <td>${escapeHtml(e.department || '—')}</td>
      <td>${e.date_hired || '—'}</td>
      <td><span class="badge ${e.employment_type === 'Regular' ? 'badge-green' : 'badge-yellow'}">${e.employment_type}</span></td>
      <td>
        <button class="btn-icon-text" onclick="editEmployee('${e.id}')">Edit</button>
        <button class="btn-danger-text" onclick="deleteRow('employees','${e.id}', 'employees')">Delete</button>
      </td>
    </tr>
  `).join('');
}
document.addEventListener('input', (e) => {
  if (e.target.id === 'empSearch') renderEmployeesTable();
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'empTypeFilter') renderEmployeesTable();
});

function employeeFormHtml(e = {}) {
  return `
    <div class="form-grid">
      <div class="field-sm span-2"><label>Full Name</label><input id="f_name" value="${escapeHtml(e.name || '')}"></div>
      <div class="field-sm"><label>Position</label><input id="f_position" value="${escapeHtml(e.position || '')}"></div>
      <div class="field-sm"><label>Department</label><input id="f_department" value="${escapeHtml(e.department || '')}"></div>
      <div class="field-sm"><label>Date Hired</label><input type="date" id="f_date_hired" value="${e.date_hired || ''}"></div>
      <div class="field-sm"><label>Employment Type</label>
        <select id="f_employment_type">
          <option value="Probationary" ${e.employment_type === 'Probationary' ? 'selected' : ''}>Probationary</option>
          <option value="Regular" ${e.employment_type === 'Regular' ? 'selected' : ''}>Regular</option>
        </select>
      </div>
    </div>`;
}
document.getElementById('addEmployeeBtn').addEventListener('click', () => {
  openModal('Add Employee', employeeFormHtml(), saveEmployee);
});
window.editEmployee = function (id) {
  const e = EMPLOYEES.find(x => x.id === id);
  editingId = id; editingTable = 'employees';
  openModal('Edit Employee', employeeFormHtml(e), saveEmployee);
};
async function saveEmployee() {
  const payload = {
    name: val('f_name'), position: strOrNull('f_position'),
    department: strOrNull('f_department'), date_hired: strOrNull('f_date_hired'),
    employment_type: val('f_employment_type'),
  };
  if (!payload.name) { toast('Name is required', 'error'); return; }
  let error;
  if (editingId) ({ error } = await supabase.from('employees').update(payload).eq('id', editingId));
  else ({ error } = await supabase.from('employees').insert(payload));
  if (error) { toast(error.message, 'error'); return; }
  toast('Employee saved', 'success');
  closeModal();
  await loadEmployeesFull();
}
async function loadEmployeesFull() { await loadEmployees(); renderEmployeesTable(); }

// Refresh callbacks are looked up by string key rather than passed as bare
// function references — inline onclick="" attributes evaluate in global
// scope, and top-level functions in an ES module are NOT attached to
// window automatically, so a bare function name there throws a silent
// ReferenceError and the whole click handler (including the delete call
// itself) never runs.
const REFRESH_BY_KEY = {
  employees: loadEmployeesFull,
  probationary: () => loadEvaluations('Probationary'),
  regular: () => loadEvaluations('Regular'),
  hrAttention: () => loadHrAttention(),
  thirdFifth: () => loadThirdFifth(),
};

async function deleteRow(table, id, refreshKey) {
  if (!confirm('Delete this record? This cannot be undone.')) return;
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Deleted', 'success');
  const refreshFn = REFRESH_BY_KEY[refreshKey];
  if (refreshFn) await refreshFn();
}
window.deleteRow = deleteRow;

// ---------------------------------------------------------------------------
// EVALUATIONS (Probationary & Regular share one table, filtered by type)
// ---------------------------------------------------------------------------
const PROB_RESULTS = ['Passed', 'Failed'];
const REG_RESULTS = ['Satisfactory', 'Needs Improvement', 'Failed', 'PIP', 'For Review', 'Completed'];

async function loadEvaluations(type) {
  const { data, error } = await supabase
    .from('evaluations')
    .select('*, employees(name, position, department)')
    .eq('employment_type', type)
    .eq('reporting_month', SELECTED_MONTH)
    .order('created_at', { ascending: false });
  if (error) { toast(error.message, 'error'); return; }

  if (type === 'Probationary') renderProbTable(data || []);
  else renderRegTable(data || []);
}

function resultBadge(result) {
  const map = {
    'Passed': 'badge-green', 'Satisfactory': 'badge-green', 'Completed': 'badge-green',
    'Failed': 'badge-red',
    'Needs Improvement': 'badge-yellow', 'PIP': 'badge-yellow',
    'For Review': 'badge-blue',
  };
  return `<span class="badge ${map[result] || 'badge-grey'}">${result}</span>`;
}

function renderProbTable(rows) {
  const search = (document.getElementById('probSearch').value || '').toLowerCase();
  const filtered = rows.filter(r => !search || (r.employees?.name || '').toLowerCase().includes(search));
  const tbody = document.getElementById('probTbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="10">No probationary evaluations logged for this month yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td><strong>${escapeHtml(r.employees?.name || '—')}</strong></td>
      <td>${escapeHtml(r.employees?.position || '—')}</td>
      <td>${escapeHtml(r.employees?.department || '—')}</td>
      <td>${escapeHtml(r.stage || '—')}</td>
      <td>${resultBadge(r.evaluation_result)}</td>
      <td>${r.kpi_score != null ? r.kpi_score + '%' : '—'}</td>
      <td>${r.lates ?? 0}</td>
      <td>${r.absences ?? 0}</td>
      <td>${r.undertime ?? 0}</td>
      <td>
        <button class="btn-icon-text" onclick='editEvaluation(${JSON.stringify(r).replace(/'/g, "&apos;")})'>Edit</button>
        <button class="btn-danger-text" onclick="deleteRow('evaluations','${r.id}', 'probationary')">Delete</button>
      </td>
    </tr>
  `).join('');
}

function renderRegTable(rows) {
  const search = (document.getElementById('regSearch').value || '').toLowerCase();
  const filtered = rows.filter(r => !search || (r.employees?.name || '').toLowerCase().includes(search));
  const tbody = document.getElementById('regTbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="11">No regular employee evaluations logged for this month yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td><strong>${escapeHtml(r.employees?.name || '—')}</strong></td>
      <td>${escapeHtml(r.employees?.position || '—')}</td>
      <td>${escapeHtml(r.employees?.department || '—')}</td>
      <td>${escapeHtml(r.stage || '—')}</td>
      <td>${resultBadge(r.evaluation_result)}</td>
      <td>${r.kpi_score != null ? r.kpi_score + '%' : '—'}</td>
      <td>${r.lates ?? 0}</td>
      <td>${r.absences ?? 0}</td>
      <td>${r.undertime ?? 0}</td>
      <td>${escapeHtml(r.action_notes || '—')}</td>
      <td>
        <button class="btn-icon-text" onclick='editEvaluation(${JSON.stringify(r).replace(/'/g, "&apos;")})'>Edit</button>
        <button class="btn-danger-text" onclick="deleteRow('evaluations','${r.id}', 'regular')">Delete</button>
      </td>
    </tr>
  `).join('');
}

document.addEventListener('input', (e) => {
  if (e.target.id === 'probSearch') loadEvaluations('Probationary');
  if (e.target.id === 'regSearch') loadEvaluations('Regular');
});

function evaluationFormHtml(type, r = {}) {
  const results = type === 'Probationary' ? PROB_RESULTS : REG_RESULTS;
  return `
    <div class="form-grid">
      <div class="field-sm span-2"><label>Employee</label>
        <select id="f_employee_id">${employeeOptions(type)}</select>
      </div>
      <div class="field-sm"><label>${type === 'Probationary' ? 'Month / Stage' : 'Evaluation Period'}</label>
        <input id="f_stage" value="${escapeHtml(r.stage || '')}" placeholder="${type === 'Probationary' ? 'e.g. Month 2' : 'e.g. Q3 2026'}">
      </div>
      <div class="field-sm"><label>Evaluation Result</label>
        <select id="f_result">${results.map(x => `<option ${r.evaluation_result === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      </div>
      <div class="field-sm"><label>KPI / Score (%)</label><input type="number" step="0.01" id="f_kpi" value="${r.kpi_score ?? ''}"></div>
      <div class="field-sm"><label>Lates</label><input type="number" id="f_lates" value="${r.lates ?? 0}"></div>
      <div class="field-sm"><label>Absences</label><input type="number" id="f_absences" value="${r.absences ?? 0}"></div>
      <div class="field-sm"><label>Undertime</label><input type="number" id="f_undertime" value="${r.undertime ?? 0}"></div>
      ${type === 'Regular' ? `<div class="field-sm span-2"><label>Performance Status / Action</label><textarea id="f_action_notes">${escapeHtml(r.action_notes || '')}</textarea></div>` : ''}
    </div>`;
}

document.getElementById('addProbBtn').addEventListener('click', () => {
  if (!employeeOptions('Probationary')) { toast('Add a probationary employee first', 'error'); return; }
  openModal('Add Probationary Evaluation', evaluationFormHtml('Probationary'), () => saveEvaluation('Probationary'));
});
document.getElementById('addRegBtn').addEventListener('click', () => {
  if (!employeeOptions('Regular')) { toast('Add a regular employee first', 'error'); return; }
  openModal('Add Regular Evaluation', evaluationFormHtml('Regular'), () => saveEvaluation('Regular'));
});
window.editEvaluation = function (r) {
  editingId = r.id; editingTable = 'evaluations';
  const type = r.employment_type;
  openModal('Edit Evaluation', evaluationFormHtml(type, r), () => saveEvaluation(type));
  document.getElementById('f_employee_id').value = r.employee_id;
};
async function saveEvaluation(type) {
  const payload = {
    employee_id: val('f_employee_id'),
    employment_type: type,
    reporting_month: SELECTED_MONTH,
    stage: strOrNull('f_stage'),
    evaluation_result: val('f_result'),
    kpi_score: numOrNull('f_kpi'),
    lates: numOrNull('f_lates') || 0,
    absences: numOrNull('f_absences') || 0,
    undertime: numOrNull('f_undertime') || 0,
    action_notes: type === 'Regular' ? strOrNull('f_action_notes') : null,
  };
  let error;
  if (editingId) ({ error } = await supabase.from('evaluations').update(payload).eq('id', editingId));
  else ({ error } = await supabase.from('evaluations').insert(payload));
  if (error) { toast(error.message, 'error'); return; }
  toast('Evaluation saved', 'success');
  closeModal();
  await loadEvaluations(type);
}

// ---------------------------------------------------------------------------
// HR ATTENTION
// ---------------------------------------------------------------------------
async function loadHrAttention() {
  const { data, error } = await supabase
    .from('hr_attention')
    .select('*, employees(name)')
    .eq('reporting_month', SELECTED_MONTH)
    .order('created_at', { ascending: false });
  if (error) { toast(error.message, 'error'); return; }
  const tbody = document.getElementById('hrTbody');
  if (!data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No employees flagged for HR attention this month.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(r => `
    <tr>
      <td><strong>${escapeHtml(r.employees?.name || '—')}</strong></td>
      <td>${escapeHtml(r.employment_status || '—')}</td>
      <td>${escapeHtml(r.key_performance_issue || '—')}</td>
      <td>${escapeHtml(r.coaching_support || '—')}</td>
      <td>${escapeHtml(r.expected_target || '—')}</td>
      <td>${r.next_review_date || '—'}</td>
      <td>${escapeHtml(r.recommendation || '—')}</td>
      <td>
        <button class="btn-icon-text" onclick='editHr(${JSON.stringify(r).replace(/'/g, "&apos;")})'>Edit</button>
        <button class="btn-danger-text" onclick="deleteRow('hr_attention','${r.id}', 'hrAttention')">Delete</button>
      </td>
    </tr>
  `).join('');
}
function hrFormHtml(r = {}) {
  return `
    <div class="form-grid">
      <div class="field-sm span-2"><label>Employee</label><select id="f_employee_id">${employeeOptions()}</select></div>
      <div class="field-sm"><label>Employment Status</label><input id="f_status" value="${escapeHtml(r.employment_status || '')}"></div>
      <div class="field-sm"><label>Next Review Date</label><input type="date" id="f_next_review" value="${r.next_review_date || ''}"></div>
      <div class="field-sm span-2"><label>Key Performance Issue</label><textarea id="f_issue">${escapeHtml(r.key_performance_issue || '')}</textarea></div>
      <div class="field-sm span-2"><label>Coaching / Support Provided</label><textarea id="f_coaching">${escapeHtml(r.coaching_support || '')}</textarea></div>
      <div class="field-sm span-2"><label>Expected Target</label><input id="f_target" value="${escapeHtml(r.expected_target || '')}"></div>
      <div class="field-sm span-2"><label>Recommendation</label><textarea id="f_recommendation">${escapeHtml(r.recommendation || '')}</textarea></div>
    </div>`;
}
document.getElementById('addHrBtn').addEventListener('click', () => {
  openModal('Add HR Attention Record', hrFormHtml(), saveHr);
});
window.editHr = function (r) {
  editingId = r.id; editingTable = 'hr_attention';
  openModal('Edit HR Attention Record', hrFormHtml(r), saveHr);
  document.getElementById('f_employee_id').value = r.employee_id;
};
async function saveHr() {
  const payload = {
    employee_id: val('f_employee_id'), reporting_month: SELECTED_MONTH,
    employment_status: strOrNull('f_status'), key_performance_issue: strOrNull('f_issue'),
    coaching_support: strOrNull('f_coaching'), expected_target: strOrNull('f_target'),
    next_review_date: strOrNull('f_next_review'), recommendation: strOrNull('f_recommendation'),
  };
  let error;
  if (editingId) ({ error } = await supabase.from('hr_attention').update(payload).eq('id', editingId));
  else ({ error } = await supabase.from('hr_attention').insert(payload));
  if (error) { toast(error.message, 'error'); return; }
  toast('Saved', 'success');
  closeModal();
  await loadHrAttention();
}

// ---------------------------------------------------------------------------
// 3RD & 5TH MONTH TRACKER
// ---------------------------------------------------------------------------
async function loadThirdFifth() {
  const { data, error } = await supabase
    .from('third_fifth_month')
    .select('*, employees(name)')
    .order('created_at', { ascending: false });
  if (error) { toast(error.message, 'error'); return; }
  const tbody = document.getElementById('tfTbody');
  if (!data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="11">No regularization records yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(r => `
    <tr>
      <td><strong>${escapeHtml(r.employees?.name || '—')}</strong></td>
      <td>${escapeHtml(r.department || '—')}</td>
      <td>${escapeHtml(r.position || '—')}</td>
      <td>${r.date_hired || '—'}</td>
      <td>${r.third_month_date || '—'}</td>
      <td>${r.third_month_result ? resultBadge(r.third_month_result) : '—'}</td>
      <td>${r.fifth_month_date || '—'}</td>
      <td>${r.fifth_month_result ? `<span class="badge ${r.fifth_month_result === 'Qualified' ? 'badge-green' : r.fifth_month_result === 'Not Qualified' ? 'badge-red' : 'badge-blue'}">${r.fifth_month_result}</span>` : '—'}</td>
      <td>${escapeHtml(r.final_recommendation || '—')}</td>
      <td>${escapeHtml(r.remarks || '—')}</td>
      <td>
        <button class="btn-icon-text" onclick='editTf(${JSON.stringify(r).replace(/'/g, "&apos;")})'>Edit</button>
        <button class="btn-danger-text" onclick="deleteRow('third_fifth_month','${r.id}', 'thirdFifth')">Delete</button>
      </td>
    </tr>
  `).join('');
}
function tfFormHtml(r = {}) {
  return `
    <div class="form-grid">
      <div class="field-sm span-2"><label>Employee</label><select id="f_employee_id">${employeeOptions()}</select></div>
      <div class="field-sm"><label>Department</label><input id="f_department" value="${escapeHtml(r.department || '')}"></div>
      <div class="field-sm"><label>Position</label><input id="f_position" value="${escapeHtml(r.position || '')}"></div>
      <div class="field-sm"><label>Date Hired</label><input type="date" id="f_date_hired" value="${r.date_hired || ''}"></div>
      <div class="field-sm"><label>3rd Month Date</label><input type="date" id="f_third_date" value="${r.third_month_date || ''}"></div>
      <div class="field-sm"><label>3rd Month Result</label>
        <select id="f_third_result">
          <option value="">—</option>
          ${['Passed', 'Failed', 'PIP'].map(x => `<option ${r.third_month_result === x ? 'selected' : ''}>${x}</option>`).join('')}
        </select>
      </div>
      <div class="field-sm"><label>5th Month Date</label><input type="date" id="f_fifth_date" value="${r.fifth_month_date || ''}"></div>
      <div class="field-sm"><label>5th Month Result</label>
        <select id="f_fifth_result">
          <option value="">—</option>
          ${['Qualified', 'Not Qualified', 'Review'].map(x => `<option ${r.fifth_month_result === x ? 'selected' : ''}>${x}</option>`).join('')}
        </select>
      </div>
      <div class="field-sm span-2"><label>Final Recommendation</label><input id="f_final_rec" value="${escapeHtml(r.final_recommendation || '')}"></div>
      <div class="field-sm span-2"><label>Remarks</label><textarea id="f_remarks">${escapeHtml(r.remarks || '')}</textarea></div>
    </div>`;
}
document.getElementById('addTfBtn').addEventListener('click', () => {
  openModal('Add Regularization Record', tfFormHtml(), saveTf);
});
window.editTf = function (r) {
  editingId = r.id; editingTable = 'third_fifth_month';
  openModal('Edit Regularization Record', tfFormHtml(r), saveTf);
  document.getElementById('f_employee_id').value = r.employee_id;
};
async function saveTf() {
  const payload = {
    employee_id: val('f_employee_id'), department: strOrNull('f_department'),
    position: strOrNull('f_position'), date_hired: strOrNull('f_date_hired'),
    third_month_date: strOrNull('f_third_date'), third_month_result: strOrNull('f_third_result'),
    fifth_month_date: strOrNull('f_fifth_date'), fifth_month_result: strOrNull('f_fifth_result'),
    final_recommendation: strOrNull('f_final_rec'), remarks: strOrNull('f_remarks'),
  };
  let error;
  if (editingId) ({ error } = await supabase.from('third_fifth_month').update(payload).eq('id', editingId));
  else ({ error } = await supabase.from('third_fifth_month').insert(payload));
  if (error) { toast(error.message, 'error'); return; }
  toast('Saved', 'success');
  closeModal();
  await loadThirdFifth();
}

// ---------------------------------------------------------------------------
// PROGRESS HIGHLIGHTS (one row per month)
// ---------------------------------------------------------------------------
function monthLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

const HL_FIELD_LABELS = {
  key_improvements: 'Key Improvements / Positive Progress',
  common_gaps: 'Common Performance Gaps',
  attendance_concerns: 'Attendance / Punctuality Concerns',
  training_needs: 'Training / Development Needs',
  overall_recommendation: 'Overall HR / Management Recommendation',
};

function renderHighlightsSummary(data) {
  document.getElementById('hlSummaryMonth').textContent = monthLabel(SELECTED_MONTH);
  const body = document.getElementById('hlSummaryBody');
  const fields = Object.keys(HL_FIELD_LABELS);
  const hasAny = data && fields.some(f => data[f]);
  if (!hasAny) {
    body.innerHTML = `<div class="summary-empty">Nothing saved for this month yet — fill in the fields below and click Save All.</div>`;
    return;
  }
  body.innerHTML = fields.map(f => `
    <div class="summary-field">
      <div class="summary-label">${HL_FIELD_LABELS[f]}</div>
      <div class="${data[f] ? 'summary-value' : 'summary-empty'}">${data[f] ? escapeHtml(data[f]) : 'Not filled in'}</div>
    </div>
  `).join('');
}

async function loadHighlights() {
  const { data, error } = await supabase
    .from('progress_highlights').select('*')
    .eq('reporting_month', SELECTED_MONTH).maybeSingle();
  if (error) { toast(error.message, 'error'); return; }
  const fields = ['key_improvements', 'common_gaps', 'attendance_concerns', 'training_needs', 'overall_recommendation'];
  fields.forEach(f => { document.getElementById('hl_' + f).value = data ? (data[f] || '') : ''; });
  renderHighlightsSummary(data);
}
document.getElementById('saveHighlightsBtn').addEventListener('click', async () => {
  const payload = {
    reporting_month: SELECTED_MONTH,
    key_improvements: strOrNull('hl_key_improvements'),
    common_gaps: strOrNull('hl_common_gaps'),
    attendance_concerns: strOrNull('hl_attendance_concerns'),
    training_needs: strOrNull('hl_training_needs'),
    overall_recommendation: strOrNull('hl_overall_recommendation'),
  };
  const { error } = await supabase.from('progress_highlights').upsert(payload, { onConflict: 'reporting_month' });
  if (error) { toast(error.message, 'error'); return; }
  toast('Highlights saved', 'success');
  renderHighlightsSummary(payload);
});

// ---------------------------------------------------------------------------
// SIGN-OFF (one row per month)
// ---------------------------------------------------------------------------
function renderSignoffSummary(data) {
  document.getElementById('soSummaryMonth').textContent = monthLabel(SELECTED_MONTH);
  const badge = document.getElementById('soStatusBadge');
  const body = document.getElementById('soSummaryBody');

  const roles = [
    { who: data?.prepared_by, when: data?.prepared_date, role: 'Prepared By' },
    { who: data?.department_head, when: data?.department_head_date, role: 'Department Head' },
    { who: data?.hr_representative, when: data?.hr_representative_date, role: 'HR Representative' },
    { who: data?.management_approval, when: data?.management_date, role: 'Management Approval' },
  ];
  const completedCount = roles.filter(r => r.who).length;

  if (completedCount === 0) {
    badge.textContent = 'Not started';
    badge.className = 'badge badge-grey';
  } else if (completedCount === roles.length) {
    badge.textContent = 'Complete';
    badge.className = 'badge badge-green';
  } else {
    badge.textContent = `${completedCount} of ${roles.length} signed`;
    badge.className = 'badge badge-yellow';
  }

  body.innerHTML = `<div class="signoff-grid">` + roles.map(r => `
    <div class="signoff-block ${r.who ? 'done' : ''}">
      <div class="role">${r.role}</div>
      ${r.who
        ? `<div class="who">✓ ${escapeHtml(r.who)}</div><div class="when">${r.when || 'No date given'}</div>`
        : `<div class="pending">Awaiting sign-off</div>`}
    </div>
  `).join('') + `</div>`;
}

async function loadSignoff() {
  const { data, error } = await supabase
    .from('sign_off').select('*')
    .eq('reporting_month', SELECTED_MONTH).maybeSingle();
  if (error) { toast(error.message, 'error'); return; }
  const fields = ['prepared_by', 'prepared_date', 'department_head', 'department_head_date',
    'hr_representative', 'hr_representative_date', 'management_approval', 'management_date'];
  fields.forEach(f => { document.getElementById('so_' + f).value = data ? (data[f] || '') : ''; });
  renderSignoffSummary(data);
}
document.getElementById('saveSignoffBtn').addEventListener('click', async () => {
  const payload = {
    reporting_month: SELECTED_MONTH,
    prepared_by: strOrNull('so_prepared_by'), prepared_date: strOrNull('so_prepared_date'),
    department_head: strOrNull('so_department_head'), department_head_date: strOrNull('so_department_head_date'),
    hr_representative: strOrNull('so_hr_representative'), hr_representative_date: strOrNull('so_hr_representative_date'),
    management_approval: strOrNull('so_management_approval'), management_date: strOrNull('so_management_date'),
  };
  const { error } = await supabase.from('sign_off').upsert(payload, { onConflict: 'reporting_month' });
  if (error) { toast(error.message, 'error'); return; }
  toast('Sign-off saved', 'success');
  renderSignoffSummary(payload);
});

// ---------------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------------
let statusChartInstance, categoryChartInstance, trendChartInstance;

async function loadDashboard() {
  // Workforce totals — from the master Employees list, not scoped to a month.
  const totalProbationary = EMPLOYEES.filter(e => e.employment_type === 'Probationary').length;
  const totalRegular = EMPLOYEES.filter(e => e.employment_type === 'Regular').length;
  document.getElementById('workforceKpiGrid').innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Total Employees</div><div class="kpi-value">${EMPLOYEES.length}</div></div>
    <div class="kpi-card yellow"><div class="kpi-label">Probationary</div><div class="kpi-value">${totalProbationary}</div></div>
    <div class="kpi-card green"><div class="kpi-label">Regular</div><div class="kpi-value">${totalRegular}</div></div>
  `;
  document.getElementById('dashMonthLabel').textContent = monthLabel(SELECTED_MONTH);

  const { data: evals, error } = await supabase
    .from('evaluations').select('*')
    .eq('reporting_month', SELECTED_MONTH);
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

  const kpiGrid = document.getElementById('kpiGrid');
  kpiGrid.innerHTML = `
    <div class="kpi-card"><div class="kpi-label">Total Evaluated</div><div class="kpi-value">${evals.length}</div></div>
    <div class="kpi-card green"><div class="kpi-label">On Track</div><div class="kpi-value">${counts.onTrack}</div></div>
    <div class="kpi-card yellow"><div class="kpi-label">Needs Improvement</div><div class="kpi-value">${counts.needsImprovement}</div></div>
    <div class="kpi-card red"><div class="kpi-label">Failed</div><div class="kpi-value">${counts.failed}</div></div>
    <div class="kpi-card blue"><div class="kpi-label">PIP / Action Plan</div><div class="kpi-value">${counts.pip}</div></div>
    <div class="kpi-card"><div class="kpi-label">Completed</div><div class="kpi-value">${counts.completed}</div></div>
  `;

  // Monthly Summary by Category table (mirrors the "CATEGORY | TOTAL | ON TRACK..." table
  // from the original Excel Monthly Summary sheet)
  function categoryRow(label, type) {
    const rows = evals.filter(e => e.employment_type === type);
    const c = {
      total: rows.length,
      onTrack: rows.filter(e => ['Passed', 'Satisfactory'].includes(e.evaluation_result)).length,
      needsImprovement: rows.filter(e => e.evaluation_result === 'Needs Improvement').length,
      failed: rows.filter(e => e.evaluation_result === 'Failed').length,
      pip: rows.filter(e => e.evaluation_result === 'PIP').length,
      forReview: rows.filter(e => e.evaluation_result === 'For Review').length,
      completed: rows.filter(e => e.evaluation_result === 'Completed').length,
    };
    return `<tr>
      <td><strong>${label}</strong></td>
      <td>${c.total}</td><td>${c.onTrack}</td><td>${c.needsImprovement}</td>
      <td>${c.failed}</td><td>${c.pip}</td><td>${c.forReview}</td><td>${c.completed}</td>
    </tr>`;
  }
  document.getElementById('categorySummaryTbody').innerHTML =
    categoryRow('Probationary Employees', 'Probationary') +
    categoryRow('Regular Employees', 'Regular') +
    `<tr style="background:var(--slate-50);font-weight:700;">
      <td>Total</td><td>${evals.length}</td><td>${counts.onTrack}</td><td>${counts.needsImprovement}</td>
      <td>${counts.failed}</td><td>${counts.pip}</td><td>${counts.forReview}</td><td>${counts.completed}</td>
    </tr>`;

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

  // Category bar (Probationary vs Regular)
  const probCount = evals.filter(e => e.employment_type === 'Probationary').length;
  const regCount = evals.filter(e => e.employment_type === 'Regular').length;
  const catCtx = document.getElementById('categoryChart');
  if (categoryChartInstance) categoryChartInstance.destroy();
  categoryChartInstance = new Chart(catCtx, {
    type: 'bar',
    data: {
      labels: ['Probationary', 'Regular'],
      datasets: [{ label: 'Employees Evaluated', data: [probCount, regCount], backgroundColor: ['#F5A623', '#122A4D'], borderRadius: 6 }]
    },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });

  // Trend across last 6 months
  await loadTrendChart();
}

async function loadTrendChart() {
  const now = new Date(SELECTED_MONTH + 'T00:00:00');
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.toISOString().slice(0, 10));
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

// ---------------------------------------------------------------------------
// BULK IMPORT
// ---------------------------------------------------------------------------
const SHEET_LABELS = {
  employees: 'Employees',
  evaluations: 'Evaluations',
  hrAttention: 'HR Attention',
  thirdFifth: '3rd & 5th Month',
};

document.getElementById('runBulkImportBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('bulkImportFile');
  const statusEl = document.getElementById('bulkImportStatus');
  const resultsEl = document.getElementById('bulkImportResults');
  const btn = document.getElementById('runBulkImportBtn');

  const file = fileInput.files[0];
  if (!file) { toast('Choose a file first', 'error'); return; }

  btn.disabled = true;
  btn.textContent = 'Importing…';
  statusEl.textContent = 'Reading and validating your file…';
  resultsEl.innerHTML = '';

  try {
    const results = await runBulkImport(file, EMPLOYEES);

    let totalAdded = 0, totalSkipped = 0;
    Object.values(results).forEach(r => { totalAdded += r.added; totalSkipped += r.skipped.length; });

    statusEl.textContent = '';
    resultsEl.innerHTML = Object.entries(results).map(([key, r]) => {
      if (r.added === 0 && r.skipped.length === 0) return ''; // sheet was empty, don't clutter
      const skippedRows = r.skipped.map(s => `
        <tr><td>Row ${s.row}</td><td>${escapeHtml(s.name || '—')}</td><td>${escapeHtml(s.reason)}</td></tr>
      `).join('');
      return `
        <div class="text-block">
          <h3>${SHEET_LABELS[key]} — ${r.added} row(s) added, ${r.skipped.length} skipped</h3>
          ${r.skipped.length ? `
            <div class="table-wrap" style="box-shadow:none;margin-top:8px;">
              <table>
                <thead><tr><th>Row</th><th>Name</th><th>Reason skipped</th></tr></thead>
                <tbody>${skippedRows}</tbody>
              </table>
            </div>` : ''}
        </div>`;
    }).join('');

    toast(`Import finished — ${totalAdded} added, ${totalSkipped} skipped`, totalAdded > 0 ? 'success' : 'error');

    // Refresh caches/views so newly imported data shows up immediately
    await loadEmployees();
    await refreshCurrentView();
  } catch (err) {
    statusEl.textContent = '';
    toast('Import failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Run Import';
  }
});

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function bindStaticButtons() { /* placeholder for future static bindings */ }
