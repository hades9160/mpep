// ============================================================================
// EMPLOYEES — master employee list. Every employee added here automatically
// feeds the Probationary / Regular / 3rd & 5th Month pages, which are all
// employee-driven rather than manually populated (see pages/evaluations.js
// and pages/thirdFifth.js).
// ============================================================================
import { supabase } from '../supabaseClient.js';
import { store } from '../store.js';
import { toast, escapeHtml, val, strOrNull, populateDeptFilter, formatLengthOfService, monthLabel, resultBadge } from '../utils.js';
import { openModal, closeModal } from '../ui.js';
import { currentView, refreshCurrentView } from '../nav.js';
import * as XLSX from 'xlsx';

export async function loadEmployees() {
  const { data, error } = await supabase.from('employees').select('*').order('name');
  if (error) { toast(error.message, 'error'); return; }
  store.employees = data || [];
}

export function employeeOptions(type) {
  return store.employees
    .filter(e => !type || e.employment_type === type)
    .map(e => `<option value="${e.id}">${escapeHtml(e.name)} — ${escapeHtml(e.position || '')}</option>`)
    .join('');
}

export async function loadEmployeesView() {
  populateDeptFilter('empDeptFilter', store.employees.map(e => e.department));
  renderEmployeesTable();
}

export function renderEmployeesTable() {
  const search = (document.getElementById('empSearch').value || '').toLowerCase();
  const typeFilter = document.getElementById('empTypeFilter').value;
  const deptFilter = document.getElementById('empDeptFilter').value;
  const rows = store.employees.filter(e =>
    (!typeFilter || e.employment_type === typeFilter) &&
    (!deptFilter || e.department === deptFilter) &&
    (!search || e.name.toLowerCase().includes(search))
  );
  const tbody = document.getElementById('employeesTbody');
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No employees match your filters.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(e => `
    <tr class="clickable-row" data-emp-id="${e.id}">
      <td><strong class="truncate" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</strong></td>
      <td><span class="truncate" title="${escapeHtml(e.position || '')}">${escapeHtml(e.position || '—')}</span></td>
      <td>${escapeHtml(e.department || '—')}</td>
      <td>${e.date_hired || '—'}</td>
      <td>${formatLengthOfService(e.date_hired)}</td>
      <td><span class="badge ${e.employment_type === 'Regular' ? 'badge-green' : 'badge-yellow'}">${e.employment_type}</span></td>
      <td>
        <button class="btn-icon-text" onclick="viewEmployeeDetails('${e.id}')">Details</button>
        <button class="btn-icon-text" onclick="editEmployee('${e.id}')">Edit</button>
        <button class="btn-icon-text" onclick="downloadEmployeeDetails('${e.id}')">⬇ Download</button>
        <button class="btn-danger-text" onclick="deleteRow('employees','${e.id}', 'employees')">Delete</button>
      </td>
    </tr>
  `).join('');
}
// Clicking anywhere in a row (outside its buttons) opens the same details
// modal as the "Details" button — handled here rather than in ui.js's
// generic row-selection listener because only the Employees table opens a
// modal on row click.
document.addEventListener('click', (e) => {
  const row = e.target.closest('#employeesTbody tr[data-emp-id]');
  if (!row) return;
  if (e.target.closest('button, a, input, select, textarea')) return;
  window.viewEmployeeDetails(row.dataset.empId);
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'empSearch') renderEmployeesTable();
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'empTypeFilter' || e.target.id === 'empDeptFilter') renderEmployeesTable();
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
  const e = store.employees.find(x => x.id === id);
  store.editingId = id; store.editingTable = 'employees';
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
  if (store.editingId) ({ error } = await supabase.from('employees').update(payload).eq('id', store.editingId));
  else ({ error } = await supabase.from('employees').insert(payload));
  if (error) { toast(error.message, 'error'); return; }
  toast('Employee saved', 'success');
  closeModal();
  await loadEmployeesFull();
}

// Employees feed Probationary/Regular/3rd&5th rosters directly, so after any
// employee change, refresh whichever page is currently visible. This creates
// a circular import with nav.js (nav.js dispatches TO this page's loader,
// this page calls back INTO nav.js to refresh) — that's safe here because
// both sides only reference each other inside function bodies (event
// handlers, called later), never at module-top-level during initial load.
export async function loadEmployeesFull() {
  await loadEmployees();
  if (currentView() === 'employees') renderEmployeesTable();
  else await refreshCurrentView();
}

// ---------------------------------------------------------------------------
// EMPLOYEE DETAILS — click a row (or "Details") to see everything on file
// for that employee: profile, full evaluation history, HR attention
// records, and 3rd/5th month result. Also reused to build the per-employee
// Excel export.
// ---------------------------------------------------------------------------
async function fetchEmployeeFullRecord(employeeId) {
  const employee = store.employees.find(x => x.id === employeeId);
  if (!employee) return null;

  const [{ data: evals, error: evalErr }, { data: hr, error: hrErr }, { data: tf, error: tfErr }] = await Promise.all([
    supabase.from('evaluations').select('*').eq('employee_id', employeeId).order('reporting_month', { ascending: false }),
    supabase.from('hr_attention').select('*').eq('employee_id', employeeId).order('reporting_month', { ascending: false }),
    supabase.from('third_fifth_month').select('*').eq('employee_id', employeeId).maybeSingle(),
  ]);
  if (evalErr) toast(evalErr.message, 'error');
  if (hrErr) toast(hrErr.message, 'error');
  if (tfErr && tfErr.code !== 'PGRST116') toast(tfErr.message, 'error');

  return { employee, evaluations: evals || [], hrAttention: hr || [], thirdFifth: tf || null };
}

window.viewEmployeeDetails = async function (employeeId) {
  const record = await fetchEmployeeFullRecord(employeeId);
  if (!record) return;
  const { employee: e, evaluations, hrAttention, thirdFifth: tf } = record;

  const evalRows = evaluations.length
    ? evaluations.map(r => `
        <tr>
          <td>${monthLabel(r.reporting_month)}</td>
          <td>${escapeHtml(r.stage || '—')}</td>
          <td>${resultBadge(r.evaluation_result)}</td>
          <td>${r.kpi_score != null ? r.kpi_score + '%' : '—'}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" class="history-empty">No evaluations logged.</td></tr>`;

  const hrRows = hrAttention.length
    ? hrAttention.map(r => `
        <tr>
          <td>${monthLabel(r.reporting_month)}</td>
          <td>${escapeHtml(r.key_performance_issue || '—')}</td>
          <td>${escapeHtml(r.recommendation || '—')}</td>
        </tr>`).join('')
    : `<tr><td colspan="3" class="history-empty">No HR attention records.</td></tr>`;

  document.getElementById('historyModalTitle').textContent = `Employee Details — ${e.name}`;
  document.getElementById('historyModalBody').innerHTML = `
    <div class="history-emp-header">
      <div>
        <div class="name">${escapeHtml(e.name)}</div>
        <div class="meta">
          ${escapeHtml(e.position || '—')} · ${escapeHtml(e.department || '—')} · Hired ${e.date_hired || '—'}
          · Length of service: ${formatLengthOfService(e.date_hired)}
          · <span class="badge ${e.employment_type === 'Regular' ? 'badge-green' : 'badge-yellow'}">${e.employment_type}</span>
        </div>
      </div>
    </div>

    <h4>Evaluation History</h4>
    <table class="history-mini-table">
      <thead><tr><th>Month</th><th>Stage</th><th>Result</th><th>KPI</th></tr></thead>
      <tbody>${evalRows}</tbody>
    </table>

    <h4>HR Attention Records</h4>
    <table class="history-mini-table">
      <thead><tr><th>Month</th><th>Key Issue</th><th>Recommendation</th></tr></thead>
      <tbody>${hrRows}</tbody>
    </table>

    ${tf ? `
    <h4>3rd &amp; 5th Month Review</h4>
    <table class="history-mini-table">
      <thead><tr><th>3rd Month</th><th>5th Month</th><th>Final Recommendation</th></tr></thead>
      <tbody><tr>
        <td>${tf.third_month_result ? resultBadge(tf.third_month_result) : '—'}${tf.third_month_date ? ` (${tf.third_month_date})` : ''}</td>
        <td>${tf.fifth_month_result ? escapeHtml(tf.fifth_month_result) : '—'}${tf.fifth_month_date ? ` (${tf.fifth_month_date})` : ''}</td>
        <td>${escapeHtml(tf.final_recommendation || '—')}</td>
      </tr></tbody>
    </table>` : ''}

    <div style="margin-top:14px;">
      <button class="btn btn-amber" onclick="downloadEmployeeDetails('${e.id}')">⬇ Download as Excel</button>
    </div>
  `;
  document.getElementById('historyModalOverlay').classList.add('active');
};

window.downloadEmployeeDetails = async function (employeeId) {
  const record = await fetchEmployeeFullRecord(employeeId);
  if (!record) return;
  const { employee: e, evaluations, hrAttention, thirdFifth: tf } = record;

  const wb = XLSX.utils.book_new();

  const profileSheet = XLSX.utils.aoa_to_sheet([
    ['Field', 'Value'],
    ['Name', e.name || ''],
    ['Position', e.position || ''],
    ['Department', e.department || ''],
    ['Date Hired', e.date_hired || ''],
    ['Length of Service', formatLengthOfService(e.date_hired)],
    ['Employment Type', e.employment_type || ''],
  ]);
  XLSX.utils.book_append_sheet(wb, profileSheet, 'Profile');

  const evalSheet = XLSX.utils.json_to_sheet(evaluations.map(r => ({
    Month: monthLabel(r.reporting_month),
    Stage: r.stage || '',
    Result: r.evaluation_result || '',
    'KPI (%)': r.kpi_score ?? '',
    Lates: r.lates ?? 0,
    Absences: r.absences ?? 0,
    Undertime: r.undertime ?? 0,
    'Action Notes': r.action_notes || '',
  })));
  XLSX.utils.book_append_sheet(wb, evalSheet, 'Evaluations');

  const hrSheet = XLSX.utils.json_to_sheet(hrAttention.map(r => ({
    Month: monthLabel(r.reporting_month),
    'Employment Status': r.employment_status || '',
    'Key Performance Issue': r.key_performance_issue || '',
    'Coaching / Support': r.coaching_support || '',
    'Expected Target': r.expected_target || '',
    'Next Review Date': r.next_review_date || '',
    Recommendation: r.recommendation || '',
  })));
  XLSX.utils.book_append_sheet(wb, hrSheet, 'HR Attention');

  const tfSheet = XLSX.utils.aoa_to_sheet([
    ['Field', 'Value'],
    ['3rd Month Date', tf?.third_month_date || ''],
    ['3rd Month Result', tf?.third_month_result || ''],
    ['5th Month Date', tf?.fifth_month_date || ''],
    ['5th Month Result', tf?.fifth_month_result || ''],
    ['Final Recommendation', tf?.final_recommendation || ''],
    ['Remarks', tf?.remarks || ''],
  ]);
  XLSX.utils.book_append_sheet(wb, tfSheet, '3rd & 5th Month');

  const safeName = (e.name || 'employee').replace(/[^\w\- ]/g, '').trim().replace(/\s+/g, '_');
  XLSX.writeFile(wb, `${safeName}_details.xlsx`);
};
