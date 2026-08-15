// ============================================================================
// Generic modal (used for every Add/Edit form) + the evaluation History
// modal's open/close chrome + click-to-highlight row selection. These are
// UI mechanics shared by every page, not tied to any one data type.
// ============================================================================
import { store } from './store.js';

// ---------------------------------------------------------------------------
// GENERIC MODAL (Add/Edit forms)
// ---------------------------------------------------------------------------
export function bindModalChrome() {
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalCancel').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });
}
export function openModal(title, bodyHtml, onSave) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.add('active');
  const saveBtn = document.getElementById('modalSave');
  const newSaveBtn = saveBtn.cloneNode(true); // strip old listeners
  saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
  newSaveBtn.addEventListener('click', onSave);
}
export function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  store.editingId = null; store.editingTable = null;
}

// ---------------------------------------------------------------------------
// EVALUATION HISTORY MODAL — chrome only (open/close). The content itself
// is rendered by pages/evaluations.js, which owns the per-employee history
// state (which employee, which evaluation is being edited).
// ---------------------------------------------------------------------------
export function bindHistoryModalChrome(closeHistoryModal) {
  document.getElementById('historyModalClose').addEventListener('click', closeHistoryModal);
  document.getElementById('historyModalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'historyModalOverlay') closeHistoryModal();
  });
}

// ---------------------------------------------------------------------------
// ROW SELECTION (click-to-highlight, not text selection)
// A single delegated listener handles every current and future table body —
// clicking a row (not a button/link inside it) toggles a highlight so HR can
// visually track which record they're about to edit before clicking Edit.
// ---------------------------------------------------------------------------
export function setupRowSelection() {
  document.addEventListener('click', (e) => {
    const row = e.target.closest('tbody tr');
    if (!row || row.classList.contains('empty-row')) return;
    if (e.target.closest('button, a, input, select, textarea')) return; // let controls work normally
    const alreadySelected = row.classList.contains('row-selected');
    row.parentElement.querySelectorAll('tr.row-selected').forEach(r => r.classList.remove('row-selected'));
    if (!alreadySelected) row.classList.add('row-selected');
  });
}
