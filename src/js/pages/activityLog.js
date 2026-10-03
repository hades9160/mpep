// ============================================================================
// ACTIVITY LOG — read-only view of every recorded system change (see
// activityLog.js for the write side). Shows who did what and when, across
// every page in the app.
// ============================================================================
import { supabase } from '../supabaseClient.js';
import { toast, escapeHtml } from '../utils.js';

let lastLogRows = [];

const ACTION_BADGE = {
  created: 'badge-green',
  updated: 'badge-blue',
  deleted: 'badge-red',
  imported: 'badge-yellow',
  restored: 'badge-yellow',
};

function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export async function loadActivityLog() {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) { toast(error.message, 'error'); return; }
  lastLogRows = data || [];
  populateActorFilter();
  renderActivityLog(lastLogRows);
}

function populateActorFilter() {
  const sel = document.getElementById('logActorFilter');
  const current = sel.value;
  const actors = [...new Set(lastLogRows.map(r => r.actor_email))].sort();
  sel.innerHTML = `<option value="">Everyone</option>` +
    actors.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
  if (actors.includes(current)) sel.value = current;
}

function renderActivityLog(rows) {
  const search = (document.getElementById('logSearch').value || '').toLowerCase();
  const actionFilter = document.getElementById('logActionFilter').value;
  const actorFilter = document.getElementById('logActorFilter').value;

  const filtered = rows.filter(r => {
    if (actionFilter && r.action !== actionFilter) return false;
    if (actorFilter && r.actor_email !== actorFilter) return false;
    if (search) {
      const haystack = `${r.actor_email} ${r.entity} ${r.summary} ${r.details || ''}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const tbody = document.getElementById('activityLogTbody');
  if (!filtered.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No activity matches your filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td style="white-space:nowrap;">${formatWhen(r.created_at)}</td>
      <td><span class="truncate" title="${escapeHtml(r.actor_email)}">${escapeHtml(r.actor_email)}</span></td>
      <td><span class="badge ${ACTION_BADGE[r.action] || 'badge-grey'}">${escapeHtml(r.action)}</span></td>
      <td>${escapeHtml(r.entity)}</td>
      <td>
        <span class="truncate" title="${escapeHtml(r.summary)}" style="max-width:260px;">${escapeHtml(r.summary)}</span>
        ${r.details ? `<div style="font-size:11.5px;color:var(--slate-400);margin-top:2px;">${escapeHtml(r.details)}</div>` : ''}
      </td>
    </tr>
  `).join('');
}

document.addEventListener('input', (e) => {
  if (e.target.id === 'logSearch') renderActivityLog(lastLogRows);
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'logActionFilter' || e.target.id === 'logActorFilter') renderActivityLog(lastLogRows);
});

const refreshBtn = document.getElementById('refreshActivityLogBtn');
if (refreshBtn) refreshBtn.addEventListener('click', loadActivityLog);
