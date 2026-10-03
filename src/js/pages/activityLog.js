// ============================================================================
// ACTIVITY LOG — read-only trail of every system change (who / what / when).
// Rows are written by database triggers (supabase/activity_log.sql), so
// Bulk Import and Restore are captured too. Not scoped to a reporting month.
// ============================================================================
import { supabase } from '../supabaseClient.js';
import { toast, escapeHtml } from '../utils.js';

const PAGE_SIZE = 200;
let limit = PAGE_SIZE;
let loadedRows = [];

const AREA_NAMES = {
  employees: 'Employees',
  evaluations: 'Evaluations',
  hr_attention: 'HR Attention',
  third_fifth_month: '3rd & 5th Month',
};
const ACTION_BADGE = {
  CREATE: ['badge-green', 'Added'],
  UPDATE: ['badge-blue', 'Edited'],
  DELETE: ['badge-red', 'Deleted'],
  LOGIN:  ['badge-grey', 'Sign in'],
  LOGOUT: ['badge-grey', 'Sign out'],
};
const HIDDEN_FIELDS = new Set(['id', 'employee_id', 'created_at', 'updated_at']);

export async function loadActivityLog() {
  const tbody = document.getElementById('logTbody');
  const action = document.getElementById('logActionFilter').value;
  const area = document.getElementById('logAreaFilter').value;

  let q = supabase.from('activity_log').select('*')
    .order('created_at', { ascending: false }).limit(limit);
  if (action) q = q.eq('action', action);
  if (area) q = q.eq('table_name', area);

  const { data, error } = await q;
  if (error) {
    const missing = error.code === '42P01' || /activity_log/.test(error.message || '');
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">${missing
      ? 'Activity log is not set up yet. Run supabase/activity_log.sql in the Supabase SQL Editor.'
      : escapeHtml(error.message)}</td></tr>`;
    toast(error.message, 'error');
    return;
  }
  loadedRows = data;
  renderLog();
  document.getElementById('logMoreBtn').style.display = data.length >= limit ? '' : 'none';
}

function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '—';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}
function fieldName(k) {
  const s = k.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function detailsHtml(r) {
  if (r.action === 'CREATE') return '<span class="log-muted">New record</span>';
  if (r.action === 'DELETE') return '<span class="log-muted">Record removed</span>';
  if (r.action === 'UPDATE' && r.changes) {
    const items = Object.entries(r.changes).filter(([k]) => !HIDDEN_FIELDS.has(k));
    if (!items.length) return '<span class="log-muted">—</span>';
    return items.map(([k, c]) => `
      <div class="log-change"><span class="log-field">${escapeHtml(fieldName(k))}:</span>
        <span class="log-old">${escapeHtml(fmtVal(c.from))}</span> →
        <span class="log-new">${escapeHtml(fmtVal(c.to))}</span></div>`).join('');
  }
  return '<span class="log-muted">—</span>';
}

function renderLog() {
  const tbody = document.getElementById('logTbody');
  const term = document.getElementById('logSearch').value.trim().toLowerCase();
  const rows = loadedRows.filter(r => !term ||
    [r.user_email, r.record_label, AREA_NAMES[r.table_name]]
      .some(v => (v || '').toLowerCase().includes(term)));

  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No activity found.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const [cls, label] = ACTION_BADGE[r.action] || ['badge-grey', r.action];
    const when = new Date(r.created_at).toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    return `
      <tr>
        <td>${escapeHtml(when)}</td>
        <td>${escapeHtml(r.user_email || '—')}</td>
        <td><span class="badge ${cls}">${label}</span></td>
        <td>${escapeHtml(AREA_NAMES[r.table_name] || '—')}</td>
        <td><strong class="truncate" title="${escapeHtml(r.record_label || '')}">${escapeHtml(r.record_label || '—')}</strong></td>
        <td class="log-details">${detailsHtml(r)}</td>
      </tr>`;
  }).join('');
}

document.getElementById('logSearch').addEventListener('input', renderLog);
document.getElementById('logActionFilter').addEventListener('change', () => { limit = PAGE_SIZE; loadActivityLog(); });
document.getElementById('logAreaFilter').addEventListener('change', () => { limit = PAGE_SIZE; loadActivityLog(); });
document.getElementById('logRefreshBtn').addEventListener('click', () => { limit = PAGE_SIZE; loadActivityLog(); });
document.getElementById('logMoreBtn').addEventListener('click', () => { limit += PAGE_SIZE; loadActivityLog(); });
