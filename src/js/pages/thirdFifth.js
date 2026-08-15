// ============================================================================
// 3RD & 5TH MONTH TRACKER — auto-driven from the Probationary employee
// roster. No manual "add employee" step: every Probationary employee shows
// up here automatically, with months-employed and due/overdue flags
// computed from Date Hired. Recording a result upserts one row per employee
// (keyed by employee_id) rather than requiring the row to be created first.
// ============================================================================
import { supabase } from '../supabaseClient.js';
import { store } from '../store.js';
import { toast, escapeHtml, strOrNull, resultBadge, monthsBetween, addMonths } from '../utils.js';
import { openModal, closeModal } from '../ui.js';

function dueBadge(monthsEmployed, targetMonth, hasResult) {
  if (hasResult) return '';
  if (monthsEmployed === null) return '';
  if (monthsEmployed >= targetMonth) return `<span class="due-badge overdue">Overdue</span>`;
  if (monthsEmployed === targetMonth - 1) return `<span class="due-badge due">Due next month</span>`;
  return `<span class="due-badge notyet">Not yet due</span>`;
}

export async function loadThirdFifth() {
  const roster = store.employees.filter(e => e.employment_type === 'Probationary');
  const ids = roster.map(e => e.id);

  let byEmployee = {};
  if (ids.length) {
    const { data, error } = await supabase
      .from('third_fifth_month').select('*').in('employee_id', ids);
    if (error) { toast(error.message, 'error'); return; }
    (data || []).forEach(r => { byEmployee[r.employee_id] = r; });
  }

  const now = new Date();
  const combined = roster.map(e => {
    const monthsEmployed = monthsBetween(e.date_hired, now);
    return { employee: e, record: byEmployee[e.id] || null, monthsEmployed };
  });

  store.lastTfRows = combined;
  renderThirdFifthTable(combined);
}

function renderThirdFifthTable(rows) {
  const search = (document.getElementById('tfSearch').value || '').toLowerCase();
  const dueFilter = document.getElementById('tfDueFilter').value;

  const filtered = rows.filter(({ employee, record, monthsEmployed }) => {
    if (search && !employee.name.toLowerCase().includes(search)) return false;
    if (dueFilter === 'due3' && !(monthsEmployed !== null && monthsEmployed >= 3 && !record?.third_month_result)) return false;
    if (dueFilter === 'due5' && !(monthsEmployed !== null && monthsEmployed >= 5 && !record?.fifth_month_result)) return false;
    return true;
  });

  const tbody = document.getElementById('tfTbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No probationary employees match your filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(({ employee: e, record: r, monthsEmployed }) => {
    const suggested3rd = e.date_hired ? addMonths(e.date_hired, 3) : null;
    const suggested5th = e.date_hired ? addMonths(e.date_hired, 5) : null;
    return `
    <tr>
      <td><strong class="truncate" title="${escapeHtml(e.name)}">${escapeHtml(e.name)}</strong></td>
      <td>${escapeHtml(e.department || '—')}</td>
      <td>${e.date_hired || '—'}</td>
      <td>${monthsEmployed !== null ? monthsEmployed + ' mo.' : '—'}</td>
      <td>
        ${r?.third_month_result
          ? `${resultBadge(r.third_month_result)}${r.third_month_date ? ` <span style="color:var(--slate-400);font-size:11px;">(${r.third_month_date})</span>` : ''}`
          : `${dueBadge(monthsEmployed, 3, false)} ${suggested3rd ? `<div style="font-size:11px;color:var(--slate-400);margin-top:2px;">target ${suggested3rd}</div>` : ''}`}
      </td>
      <td>
        ${r?.fifth_month_result
          ? `<span class="badge ${r.fifth_month_result === 'Qualified' ? 'badge-green' : r.fifth_month_result === 'Not Qualified' ? 'badge-red' : 'badge-blue'}">${r.fifth_month_result}</span>${r.fifth_month_date ? ` <span style="color:var(--slate-400);font-size:11px;">(${r.fifth_month_date})</span>` : ''}`
          : `${dueBadge(monthsEmployed, 5, false)} ${suggested5th ? `<div style="font-size:11px;color:var(--slate-400);margin-top:2px;">target ${suggested5th}</div>` : ''}`}
      </td>
      <td><span class="truncate" title="${escapeHtml(r?.final_recommendation || '')}">${escapeHtml(r?.final_recommendation || '—')}</span></td>
      <td><button class="btn-icon-text" onclick="editThirdFifth('${e.id}')">Edit</button></td>
    </tr>
  `; }).join('');
}

document.addEventListener('input', (e) => {
  if (e.target.id === 'tfSearch') renderThirdFifthTable(store.lastTfRows);
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'tfDueFilter') renderThirdFifthTable(store.lastTfRows);
});

window.editThirdFifth = function (employeeId) {
  const row = store.lastTfRows.find(x => x.employee.id === employeeId);
  if (!row) return;
  const { employee: e, record: r } = row;
  store.editingId = employeeId; // we upsert keyed by employee_id, not a third_fifth_month row id
  const suggested3rd = e.date_hired ? addMonths(e.date_hired, 3) : '';
  const suggested5th = e.date_hired ? addMonths(e.date_hired, 5) : '';
  const body = `
    <div class="form-grid">
      <div class="field-sm span-2" style="color:var(--slate-600);font-size:13px;">
        ${escapeHtml(e.name)} — ${escapeHtml(e.position || '—')} · Hired ${e.date_hired || '—'}
      </div>
      <div class="field-sm"><label>3rd Month Date</label><input type="date" id="f_third_date" value="${r?.third_month_date || suggested3rd}"></div>
      <div class="field-sm"><label>3rd Month Result</label>
        <select id="f_third_result">
          <option value="">—</option>
          ${['Passed', 'Failed', 'PIP'].map(x => `<option ${r?.third_month_result === x ? 'selected' : ''}>${x}</option>`).join('')}
        </select>
      </div>
      <div class="field-sm"><label>5th Month Date</label><input type="date" id="f_fifth_date" value="${r?.fifth_month_date || suggested5th}"></div>
      <div class="field-sm"><label>5th Month Result</label>
        <select id="f_fifth_result">
          <option value="">—</option>
          ${['Qualified', 'Not Qualified', 'Review'].map(x => `<option ${r?.fifth_month_result === x ? 'selected' : ''}>${x}</option>`).join('')}
        </select>
      </div>
      <div class="field-sm span-2"><label>Final Recommendation</label><input id="f_final_rec" value="${escapeHtml(r?.final_recommendation || '')}"></div>
      <div class="field-sm span-2"><label>Remarks</label><textarea id="f_remarks">${escapeHtml(r?.remarks || '')}</textarea></div>
    </div>`;
  openModal('3rd & 5th Month Review', body, () => saveThirdFifth(e));
};

async function saveThirdFifth(employee) {
  const payload = {
    employee_id: employee.id,
    department: employee.department, position: employee.position, date_hired: employee.date_hired,
    third_month_date: strOrNull('f_third_date'), third_month_result: strOrNull('f_third_result'),
    fifth_month_date: strOrNull('f_fifth_date'), fifth_month_result: strOrNull('f_fifth_result'),
    final_recommendation: strOrNull('f_final_rec'), remarks: strOrNull('f_remarks'),
  };
  const { error } = await supabase.from('third_fifth_month').upsert(payload, { onConflict: 'employee_id' });
  if (error) { toast(error.message, 'error'); return; }
  toast('Saved', 'success');
  closeModal();
  await loadThirdFifth();
}
