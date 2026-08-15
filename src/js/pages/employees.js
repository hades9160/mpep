// ============================================================================
// EMPLOYEES — master employee list. Every employee added here automatically
// feeds the Probationary / Regular / 3rd & 5th Month pages, which are all
// employee-driven rather than manually populated (see pages/evaluations.js
// and pages/thirdFifth.js).
// ============================================================================
import { supabase } from '../supabaseClient.js';
import { store } from '../store.js';
import { toast, escapeHtml, val, strOrNull, populateDeptFilter, formatLengthOfService } from '../utils.js';
import { openModal, closeModal } from '../ui.js';
import { currentView, refreshCurrentView } from '../nav.js';

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
    <tr>
      <td><strong class="truncate" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</strong></td>
      <td><span class="truncate" title="${escapeHtml(e.position || '')}">${escapeHtml(e.position || '—')}</span></td>
      <td>${escapeHtml(e.department || '—')}</td>
      <td>${e.date_hired || '—'}</td>
      <td>${formatLengthOfService(e.date_hired)}</td>
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
