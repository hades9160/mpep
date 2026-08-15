// ============================================================================
// BACKUP & RESTORE — dumps every table to one JSON file, and restores from
// one. Uses upsert (keyed by each table's primary key) rather than a wipe +
// reinsert, so a restore is safe to run against a database that already has
// some data in it.
// ============================================================================
import { supabase } from '../supabaseClient.js';
import { toast } from '../utils.js';
import { loadEmployees } from './employees.js';
import { refreshCurrentView } from '../nav.js';

const BACKUP_TABLES = ['employees', 'evaluations', 'hr_attention', 'third_fifth_month', 'sign_off'];

async function fetchAllRows(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

document.getElementById('downloadBackupBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('backupStatus');
  statusEl.textContent = 'Preparing backup…';
  try {
    const backup = { created_at: new Date().toISOString(), tables: {} };
    for (const table of BACKUP_TABLES) {
      backup.tables[table] = await fetchAllRows(table);
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `mpep_backup_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    const totalRows = Object.values(backup.tables).reduce((n, rows) => n + rows.length, 0);
    statusEl.textContent = `Backup downloaded — ${totalRows} record(s) across ${BACKUP_TABLES.length} tables.`;
    toast('Backup downloaded', 'success');
  } catch (err) {
    statusEl.textContent = `Backup failed: ${err.message}`;
    toast('Backup failed', 'error');
  }
});

document.getElementById('runRestoreBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('restoreBackupFile');
  const statusEl = document.getElementById('restoreStatus');
  const file = fileInput.files[0];
  if (!file) { toast('Choose a backup file first', 'error'); return; }

  let backup;
  try {
    const text = await file.text();
    backup = JSON.parse(text);
  } catch {
    statusEl.textContent = 'That file is not valid JSON.';
    toast('Invalid backup file', 'error');
    return;
  }
  if (!backup?.tables) {
    statusEl.textContent = 'That file does not look like an MPEP backup.';
    toast('Invalid backup file', 'error');
    return;
  }

  if (!confirm('Restoring will overwrite any existing records with matching IDs. This cannot be undone. Continue?')) return;

  statusEl.textContent = 'Restoring…';
  let restoredCount = 0;
  const errors = [];

  // Restore in dependency order: employees first (evaluations/hr_attention/
  // third_fifth_month all reference employee_id via foreign key).
  for (const table of BACKUP_TABLES) {
    const rows = backup.tables[table];
    if (!Array.isArray(rows) || !rows.length) continue;
    const onConflict = table === 'sign_off' ? 'reporting_month' : 'id';
    const { error } = await supabase.from(table).upsert(rows, { onConflict });
    if (error) errors.push(`${table}: ${error.message}`);
    else restoredCount += rows.length;
  }

  if (errors.length) {
    statusEl.textContent = `Restored ${restoredCount} record(s), but some tables failed: ${errors.join('; ')}`;
    toast('Restore finished with errors', 'error');
  } else {
    statusEl.textContent = `Restore complete — ${restoredCount} record(s) restored.`;
    toast('Restore complete', 'success');
  }

  fileInput.value = '';
  await loadEmployees();
  await refreshCurrentView();
});
