// ============================================================================
// EVALUATIONS — Probationary & Regular tabs are EMPLOYEE-DRIVEN: every
// employee of that type shows up automatically (from the Employees master
// list), with their evaluation for the selected month overlaid if one has
// been logged. Adding/editing evaluations for ANY month (not just the
// currently selected one) happens through the per-employee History modal,
// which also covers employees hired outside the current month (e.g. hired
// in December — HR can still log any month's evaluation there).
// ============================================================================
import { supabase } from '../supabaseClient.js';
import { store } from '../store.js';
import { toast, escapeHtml, val, numOrNull, strOrNull, resultBadge, monthLabel, populateDeptFilter } from '../utils.js';
import { bindHistoryModalChrome } from '../ui.js';
import { refreshCurrentView } from '../nav.js';

export const PROB_RESULTS = ['Passed', 'Failed'];
export const REG_RESULTS = ['Satisfactory', 'Needs Improvement', 'Failed', 'PIP', 'For Review', 'Completed'];

export async function loadEvaluationsView(type) {
  const roster = store.employees.filter(e => e.employment_type === type);
  const ids = roster.map(e => e.id);

  let monthEvalsByEmployee = {};
  if (ids.length) {
    const { data, error } = await supabase
      .from('evaluations')
      .select('*')
      .eq('reporting_month', store.selectedMonth)
      .in('employee_id', ids);
    if (error) { toast(error.message, 'error'); return; }
    (data || []).forEach(row => { monthEvalsByEmployee[row.employee_id] = row; });
  }

  const combined = roster.map(e => ({ employee: e, evaluation: monthEvalsByEmployee[e.id] || null }));

  if (type === 'Probationary') {
    store.lastProbRows = combined;
    populateDeptFilter('probDeptFilter', roster.map(e => e.department));
    renderProbTable(combined);
  } else {
    store.lastRegRows = combined;
    populateDeptFilter('regDeptFilter', roster.map(e => e.department));
    renderRegTable(combined);
  }
}

function filterCombinedRows(rows, searchId, resultId, deptId) {
  const search = (document.getElementById(searchId).value || '').toLowerCase();
  const resultFilter = document.getElementById(resultId).value;
  const deptFilter = document.getElementById(deptId).value;
  return rows.filter(({ employee, evaluation }) => {
    if (search && !employee.name.toLowerCase().includes(search)) return false;
    if (deptFilter && employee.department !== deptFilter) return false;
    if (resultFilter === '__none' && evaluation) return false;
    if (resultFilter && resultFilter !== '__none' && evaluation?.evaluation_result !== resultFilter) return false;
    return true;
  });
}

function renderProbTable(rows) {
  const filtered = filterCombinedRows(rows, 'probSearch', 'probResultFilter', 'probDeptFilter');
  const tbody = document.getElementById('probTbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No probationary employees match your filters. Add employees in the Employees tab first.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(({ employee: e, evaluation: r }) => `
    <tr>
      <td><strong class="truncate" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</strong></td>
      <td><span class="truncate" title="${escapeHtml(e.position || '')}">${escapeHtml(e.position || '—')}</span></td>
      <td>${escapeHtml(e.department || '—')}</td>
      <td>${r ? escapeHtml(r.stage || '—') : '—'}</td>
      <td>${r ? resultBadge(r.evaluation_result) : '<span class="badge badge-grey">Not evaluated</span>'}</td>
      <td>${r && r.kpi_score != null ? r.kpi_score + '%' : '—'}</td>
      <td><button class="btn-icon-text" onclick="openEvaluationHistory('${e.id}')">Manage Evaluations</button></td>
    </tr>
  `).join('');
}

function renderRegTable(rows) {
  const filtered = filterCombinedRows(rows, 'regSearch', 'regResultFilter', 'regDeptFilter');
  const tbody = document.getElementById('regTbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">No regular employees match your filters. Add employees in the Employees tab first.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(({ employee: e, evaluation: r }) => `
    <tr>
      <td><strong class="truncate" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</strong></td>
      <td><span class="truncate" title="${escapeHtml(e.position || '')}">${escapeHtml(e.position || '—')}</span></td>
      <td>${escapeHtml(e.department || '—')}</td>
      <td>${r ? escapeHtml(r.stage || '—') : '—'}</td>
      <td>${r ? resultBadge(r.evaluation_result) : '<span class="badge badge-grey">Not evaluated</span>'}</td>
      <td>${r && r.kpi_score != null ? r.kpi_score + '%' : '—'}</td>
      <td><button class="btn-icon-text" onclick="openEvaluationHistory('${e.id}')">Manage Evaluations</button></td>
    </tr>
  `).join('');
}

document.addEventListener('input', (e) => {
  if (e.target.id === 'probSearch') renderProbTable(store.lastProbRows);
  if (e.target.id === 'regSearch') renderRegTable(store.lastRegRows);
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'probResultFilter' || e.target.id === 'probDeptFilter') renderProbTable(store.lastProbRows);
  if (e.target.id === 'regResultFilter' || e.target.id === 'regDeptFilter') renderRegTable(store.lastRegRows);
});

// ---------------------------------------------------------------------------
// EVALUATION HISTORY MODAL — every month's evaluation for one employee.
// This is how HR handles employees hired mid-year: open their history and
// add an evaluation for whichever month is due, independent of the
// dashboard's global Reporting Month selector.
// ---------------------------------------------------------------------------
let historyEmployeeId = null;
let historyEditingEvalId = null;

function closeHistoryModal() {
  document.getElementById('historyModalOverlay').classList.remove('active');
  historyEmployeeId = null;
  historyEditingEvalId = null;
}
bindHistoryModalChrome(closeHistoryModal);

window.openEvaluationHistory = async function (employeeId) {
  historyEmployeeId = employeeId;
  historyEditingEvalId = null;
  document.getElementById('historyModalOverlay').classList.add('active');
  await renderHistoryModal();
};

async function renderHistoryModal() {
  const employee = store.employees.find(e => e.id === historyEmployeeId);
  if (!employee) { closeHistoryModal(); return; }

  const { data, error } = await supabase
    .from('evaluations')
    .select('*')
    .eq('employee_id', historyEmployeeId)
    .order('reporting_month', { ascending: false });
  if (error) { toast(error.message, 'error'); return; }
  const evals = data || [];

  document.getElementById('historyModalTitle').textContent = `Evaluation History — ${employee.name}`;

  const rowsHtml = evals.length
    ? evals.map(r => `
        <tr class="${historyEditingEvalId === r.id ? 'editing-row' : ''}">
          <td>${monthLabel(r.reporting_month)}</td>
          <td>${escapeHtml(r.stage || '—')}</td>
          <td>${resultBadge(r.evaluation_result)}</td>
          <td>${r.kpi_score != null ? r.kpi_score + '%' : '—'}</td>
          <td>
            <button class="btn-icon-text" onclick="startEditHistoryEval('${r.id}')">Edit</button>
            <button class="btn-danger-text" onclick="deleteHistoryEval('${r.id}')">Delete</button>
          </td>
        </tr>
      `).join('')
    : `<tr><td colspan="5" class="history-empty">No evaluations logged yet for this employee.</td></tr>`;

  const editingEval = historyEditingEvalId ? evals.find(e => e.id === historyEditingEvalId) : null;

  document.getElementById('historyModalBody').innerHTML = `
    <div class="history-emp-header">
      <div>
        <div class="name">${escapeHtml(employee.name)}</div>
        <div class="meta">${escapeHtml(employee.position || '—')} · ${escapeHtml(employee.department || '—')} · Hired ${employee.date_hired || '—'} · <span class="badge ${employee.employment_type === 'Regular' ? 'badge-green' : 'badge-yellow'}">${employee.employment_type}</span></div>
      </div>
    </div>

    <table class="history-mini-table">
      <thead><tr><th>Month</th><th>Stage</th><th>Result</th><th>KPI</th><th></th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="history-add-form">
      <h4>${editingEval ? 'Edit Evaluation' : 'Add Evaluation for a Month'}</h4>
      <div class="form-grid">
        <div class="field-sm"><label>Month</label><input type="month" id="hist_month" value="${editingEval ? editingEval.reporting_month.slice(0, 7) : store.selectedMonth.slice(0, 7)}"></div>
        <div class="field-sm"><label>${employee.employment_type === 'Probationary' ? 'Stage' : 'Period'}</label>
          <input id="hist_stage" value="${escapeHtml(editingEval?.stage || '')}" placeholder="${employee.employment_type === 'Probationary' ? 'e.g. Month 2' : 'e.g. Q3 2026'}">
        </div>
        <div class="field-sm"><label>Result</label>
          <select id="hist_result">${(employee.employment_type === 'Probationary' ? PROB_RESULTS : REG_RESULTS).map(x => `<option ${editingEval?.evaluation_result === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
        </div>
        <div class="field-sm"><label>KPI / Score (%)</label><input type="number" step="0.01" id="hist_kpi" value="${editingEval?.kpi_score ?? ''}"></div>
        <div class="field-sm"><label>Lates</label><input type="number" id="hist_lates" value="${editingEval?.lates ?? 0}"></div>
        <div class="field-sm"><label>Absences</label><input type="number" id="hist_absences" value="${editingEval?.absences ?? 0}"></div>
        <div class="field-sm"><label>Undertime</label><input type="number" id="hist_undertime" value="${editingEval?.undertime ?? 0}"></div>
        ${employee.employment_type === 'Regular' ? `<div class="field-sm span-2"><label>Performance Status / Action</label><textarea id="hist_action_notes">${escapeHtml(editingEval?.action_notes || '')}</textarea></div>` : ''}
      </div>
      <div style="margin-top:12px;display:flex;gap:8px;">
        <button class="btn btn-amber" id="historySaveBtn">${editingEval ? 'Update Evaluation' : 'Add Evaluation'}</button>
        ${editingEval ? `<button class="btn btn-outline" id="historyCancelEditBtn">Cancel Edit</button>` : ''}
      </div>
    </div>
  `;

  document.getElementById('historySaveBtn').addEventListener('click', () => saveHistoryEval(employee));
  const cancelBtn = document.getElementById('historyCancelEditBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => { historyEditingEvalId = null; renderHistoryModal(); });
}

window.startEditHistoryEval = function (evalId) {
  historyEditingEvalId = evalId;
  renderHistoryModal();
};

window.deleteHistoryEval = async function (evalId) {
  if (!confirm('Delete this evaluation? This cannot be undone.')) return;
  const { error } = await supabase.from('evaluations').delete().eq('id', evalId);
  if (error) { toast(error.message, 'error'); return; }
  toast('Deleted', 'success');
  await renderHistoryModal();
  await refreshCurrentView(); // keep Probationary/Regular table + Dashboard in sync
};

async function saveHistoryEval(employee) {
  const monthInput = val('hist_month'); // 'YYYY-MM'
  if (!monthInput) { toast('Pick a month', 'error'); return; }
  const reportingMonth = monthInput + '-01';

  const payload = {
    employee_id: employee.id,
    employment_type: employee.employment_type,
    reporting_month: reportingMonth,
    stage: strOrNull('hist_stage'),
    evaluation_result: val('hist_result'),
    kpi_score: numOrNull('hist_kpi'),
    lates: numOrNull('hist_lates') || 0,
    absences: numOrNull('hist_absences') || 0,
    undertime: numOrNull('hist_undertime') || 0,
    action_notes: employee.employment_type === 'Regular' ? strOrNull('hist_action_notes') : null,
  };

  let error;
  if (historyEditingEvalId) {
    ({ error } = await supabase.from('evaluations').update(payload).eq('id', historyEditingEvalId));
  } else {
    ({ error } = await supabase.from('evaluations').insert(payload));
  }
  if (error) { toast(error.message, 'error'); return; }
  toast('Evaluation saved', 'success');
  historyEditingEvalId = null;
  await renderHistoryModal();
  await refreshCurrentView(); // keep Probationary/Regular table + Dashboard in sync
}
