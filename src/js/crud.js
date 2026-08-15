// ============================================================================
// Generic delete handler for every page's Delete button. Centralized here
// (rather than in each page file) because it needs to know how to refresh
// EVERY page after a delete, which would otherwise create a messy web of
// cross-page imports.
// ============================================================================
import { supabase } from './supabaseClient.js';
import { toast } from './utils.js';
import { loadEmployeesFull } from './pages/employees.js';
import { loadEvaluationsView } from './pages/evaluations.js';
import { loadHrAttention } from './pages/hrAttention.js';
import { loadThirdFifth } from './pages/thirdFifth.js';

// Refresh callbacks are looked up by string key rather than passed as bare
// function references — inline onclick="" attributes evaluate in global
// scope, and top-level functions in an ES module are NOT attached to
// window automatically, so a bare function name there throws a silent
// ReferenceError and the whole click handler (including the delete call
// itself) never runs.
const REFRESH_BY_KEY = {
  employees: loadEmployeesFull,
  probationary: () => loadEvaluationsView('Probationary'),
  regular: () => loadEvaluationsView('Regular'),
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
