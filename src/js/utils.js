// ============================================================================
// Small, dependency-free helpers used across multiple pages.
// ============================================================================

// Formats a Date using its LOCAL calendar date (year/month/day as the user's
// browser sees them) — never use Date.toISOString() for this. toISOString()
// converts to UTC first, and for timezones ahead of UTC (e.g. Philippines,
// UTC+8) a local midnight timestamp rolls back to the previous day once
// converted, silently storing the wrong date. That mismatch is what broke
// the Reporting Month selector against evaluation records saved elsewhere.
export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function monthLabel(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export function monthsBetween(fromDateStr, toDate) {
  if (!fromDateStr) return null;
  const from = new Date(fromDateStr + 'T00:00:00');
  let months = (toDate.getFullYear() - from.getFullYear()) * 12 + (toDate.getMonth() - from.getMonth());
  if (toDate.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

export function addMonths(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return toDateStr(d);
}

// Human-readable "X yr Y mo" length of service, used on the Employees page.
export function formatLengthOfService(dateHiredStr) {
  if (!dateHiredStr) return '—';
  const months = monthsBetween(dateHiredStr, new Date());
  if (months === null) return '—';
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (years === 0 && remMonths === 0) return 'Just started';
  const parts = [];
  if (years > 0) parts.push(`${years} yr${years > 1 ? 's' : ''}`);
  if (remMonths > 0) parts.push(`${remMonths} mo${remMonths > 1 ? 's' : ''}`);
  return parts.join(' ');
}

export function resultBadge(result) {
  const map = {
    'Passed': 'badge-green', 'Satisfactory': 'badge-green', 'Completed': 'badge-green',
    'Failed': 'badge-red',
    'Needs Improvement': 'badge-yellow', 'PIP': 'badge-yellow',
    'For Review': 'badge-blue',
  };
  return `<span class="badge ${map[result] || 'badge-grey'}">${result}</span>`;
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// TOAST
// ---------------------------------------------------------------------------
export function toast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------------------
// Small form-field readers, used by every Add/Edit form across pages.
// ---------------------------------------------------------------------------
export function val(id) { const el = document.getElementById(id); return el ? el.value : null; }
export function numOrNull(id) { const v = val(id); return v === '' || v === null ? null : Number(v); }
export function strOrNull(id) { const v = val(id); return v === '' ? null : v; }

// Fills a "All departments" <select> with the distinct, non-empty department
// values found in the given list, preserving whatever the user had selected.
export function populateDeptFilter(selectId, deptValues) {
  const sel = document.getElementById(selectId);
  const current = sel.value;
  const depts = [...new Set(deptValues.filter(Boolean))].sort();
  sel.innerHTML = `<option value="">All departments</option>` +
    depts.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  if (depts.includes(current)) sel.value = current;
}
