// ============================================================================
// BACKUP & RESTORE — dumps every table to one styled Excel workbook, and
// restores from one. Uses upsert (keyed by each table's primary key) rather
// than a wipe + reinsert, so a restore is safe to run against a database that
// already has some data in it.
//
// The workbook layout/parsing lives in ../backupWorkbook.js; this file only
// handles fetching, downloading, and writing back to Supabase.
// ============================================================================
import { supabase } from '../supabaseClient.js';
import { toast } from '../utils.js';
import { store } from '../store.js';
import { loadEmployees } from './employees.js';
import { refreshCurrentView } from '../nav.js';
import {
  TABLE_SPECS,
  BACKUP_TABLES,
  buildBackupWorkbook,
  parseBackupWorkbook,
} from '../backupWorkbook.js';

async function fetchAllRows(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw new Error(error.message);
  return data || [];
}

function stamp(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// DOWNLOAD
// ---------------------------------------------------------------------------
document.getElementById('downloadBackupBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const statusEl = document.getElementById('backupStatus');
  btn.disabled = true;
  statusEl.textContent = 'Reading every table…';

  try {
    const tables = {};
    const skipped = [];

    for (const spec of TABLE_SPECS) {
      try {
        tables[spec.table] = await fetchAllRows(spec.table);
      } catch (err) {
        // A legacy table (sign_off, progress_highlights) may have been dropped.
        // That should not kill the whole backup.
        if (spec.optional) skipped.push({ table: spec.table, reason: err.message });
        else throw new Error(`${spec.table}: ${err.message}`);
      }
    }

    statusEl.textContent = 'Building the Excel workbook…';
    const generatedAt = new Date();
    const wb = await buildBackupWorkbook({
      tables,
      skipped,
      generatedBy: store.currentUser?.email || '',
      generatedAt,
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    downloadBlob(blob, `MPEP_Backup_${stamp(generatedAt)}.xlsx`);

    const totalRows = Object.values(tables).reduce((n, rows) => n + rows.length, 0);
    const sheetCount = Object.keys(tables).length;
    statusEl.textContent =
      `Backup downloaded — ${totalRows} record(s) across ${sheetCount} sheet(s).` +
      (skipped.length ? ` Skipped: ${skipped.map(s => s.table).join(', ')}.` : '');
    toast('Excel backup downloaded', 'success');
  } catch (err) {
    statusEl.textContent = `Backup failed: ${err.message}`;
    toast('Backup failed', 'error');
  } finally {
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// RESTORE
// ---------------------------------------------------------------------------
document.getElementById('runRestoreBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const fileInput = document.getElementById('restoreBackupFile');
  const statusEl = document.getElementById('restoreStatus');
  const file = fileInput.files[0];
  if (!file) { toast('Choose a backup file first', 'error'); return; }

  let tables;
  let warnings = [];

  try {
    if (/\.json$/i.test(file.name)) {
      // Backups downloaded before the Excel change are still restorable.
      const parsed = JSON.parse(await file.text());
      if (!parsed?.tables) throw new Error('That JSON file does not look like an MPEP backup.');
      tables = parsed.tables;
    } else {
      const parsed = await parseBackupWorkbook(await file.arrayBuffer());
      tables = parsed.tables;
      warnings = parsed.warnings;
    }
  } catch (err) {
    statusEl.textContent = `Could not read that file: ${err.message}`;
    toast('Invalid backup file', 'error');
    return;
  }

  const incoming = BACKUP_TABLES.reduce((n, t) => n + (tables[t]?.length || 0), 0);
  if (!incoming) {
    statusEl.textContent = 'That file contains no records to restore.';
    toast('Nothing to restore', 'error');
    return;
  }

  if (!confirm(
    `Restore ${incoming} record(s)?\n\n` +
    `Existing records with a matching ID will be overwritten. ` +
    `Rows with no ID will be added as new records. Nothing is deleted.\n\n` +
    `This cannot be undone.`
  )) return;

  btn.disabled = true;
  statusEl.textContent = 'Restoring…';

  let restoredCount = 0;
  const errors = [];

  // Restore in dependency order: employees first (evaluations / hr_attention /
  // third_fifth_month all reference employee_id via foreign key).
  for (const spec of TABLE_SPECS) {
    const rows = tables[spec.table];
    if (!Array.isArray(rows) || !rows.length) continue;
    const { error } = await supabase.from(spec.table).upsert(rows, { onConflict: spec.conflict });
    if (error) errors.push(`${spec.table}: ${error.message}`);
    else restoredCount += rows.length;
  }

  const notes = warnings.length ? ` Notes: ${warnings.join(' ')}` : '';
  if (errors.length) {
    statusEl.textContent = `Restored ${restoredCount} record(s), but some tables failed: ${errors.join('; ')}.${notes}`;
    toast('Restore finished with errors', 'error');
  } else {
    statusEl.textContent = `Restore complete — ${restoredCount} record(s) restored.${notes}`;
    toast('Restore complete', 'success');
  }

  fileInput.value = '';
  btn.disabled = false;
  await loadEmployees();
  await refreshCurrentView();
});
