// ============================================================================
// BULK IMPORT — UI wiring for the Bulk Import page. The actual file
// parsing/insert logic lives in bulkImport.js; this file just wires up the
// button, shows progress, and renders the per-sheet results.
// ============================================================================
import { store } from '../store.js';
import { toast, escapeHtml } from '../utils.js';
import { runBulkImport } from '../bulkImport.js';
import { refreshCurrentView } from '../nav.js';
import { loadEmployees } from './employees.js';

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
    const results = await runBulkImport(file, store.employees);

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
