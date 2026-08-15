// ============================================================================
// HR ATTENTION — employees flagged for HR / management attention, scoped to
// the selected reporting month.
// ============================================================================
import { supabase } from '../supabaseClient.js';
import { store } from '../store.js';
import { toast, escapeHtml, val, strOrNull } from '../utils.js';
import { openModal, closeModal } from '../ui.js';
import { employeeOptions } from './employees.js';

export async function loadHrAttention() {
  const { data, error } = await supabase
    .from('hr_attention')
    .select('*, employees(name)')
    .eq('reporting_month', store.selectedMonth)
    .order('created_at', { ascending: false });
  if (error) { toast(error.message, 'error'); return; }
  const tbody = document.getElementById('hrTbody');
  if (!data.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No employees flagged for HR attention this month.</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(r => `
    <tr>
      <td><strong class="truncate" title="${escapeHtml(r.employees?.name || '')}">${escapeHtml(r.employees?.name || '—')}</strong></td>
      <td>${escapeHtml(r.employment_status || '—')}</td>
      <td><span class="truncate" title="${escapeHtml(r.key_performance_issue || '')}">${escapeHtml(r.key_performance_issue || '—')}</span></td>
      <td><span class="truncate" title="${escapeHtml(r.coaching_support || '')}">${escapeHtml(r.coaching_support || '—')}</span></td>
      <td><span class="truncate" title="${escapeHtml(r.expected_target || '')}">${escapeHtml(r.expected_target || '—')}</span></td>
      <td>${r.next_review_date || '—'}</td>
      <td><span class="truncate" title="${escapeHtml(r.recommendation || '')}">${escapeHtml(r.recommendation || '—')}</span></td>
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
  store.editingId = r.id; store.editingTable = 'hr_attention';
  openModal('Edit HR Attention Record', hrFormHtml(r), saveHr);
  document.getElementById('f_employee_id').value = r.employee_id;
};
async function saveHr() {
  const payload = {
    employee_id: val('f_employee_id'), reporting_month: store.selectedMonth,
    employment_status: strOrNull('f_status'), key_performance_issue: strOrNull('f_issue'),
    coaching_support: strOrNull('f_coaching'), expected_target: strOrNull('f_target'),
    next_review_date: strOrNull('f_next_review'), recommendation: strOrNull('f_recommendation'),
  };
  let error;
  if (store.editingId) ({ error } = await supabase.from('hr_attention').update(payload).eq('id', store.editingId));
  else ({ error } = await supabase.from('hr_attention').insert(payload));
  if (error) { toast(error.message, 'error'); return; }
  toast('Saved', 'success');
  closeModal();
  await loadHrAttention();
}
