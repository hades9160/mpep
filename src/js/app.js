// ============================================================================
// Aurion Solar — Performance Evaluation Dashboard — main entry point
//
// This file is intentionally small: it wires up auth + global chrome, then
// imports every page module. Each page's own file (src/js/pages/*.js)
// registers its own event listeners at import time, so importing them here
// is what "activates" each page — the actual per-page logic lives there,
// not in this file.
// ============================================================================
import { supabase } from './supabaseClient.js';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

import { store } from './store.js';
import { setupNav, setupMenuToggle, populateMonthSelector, refreshCurrentView } from './nav.js';
import { bindModalChrome, setupRowSelection } from './ui.js';
import { loadEmployees } from './pages/employees.js';

// Importing these activates their event listeners (Add buttons, filters,
// etc.) — required even though this file never calls their exports directly.
import './pages/dashboard.js';
import './pages/evaluations.js';
import './pages/hrAttention.js';
import './pages/thirdFifth.js';
import './pages/bulkImportUI.js';
import './pages/backupRestore.js';
import './crud.js';

// ---------------------------------------------------------------------------
// AUTH GUARD + INIT
// ---------------------------------------------------------------------------
(async function init() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) { window.location.href = '/'; return; }
  store.currentUser = data.session.user;
  document.getElementById('userEmail').textContent = store.currentUser.email;

  supabase.auth.onAuthStateChange((event, session) => {
    if (!session) window.location.href = '/';
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  });

  setupNav();
  setupMenuToggle();
  populateMonthSelector();
  bindModalChrome();
  setupRowSelection();

  await loadEmployees();
  await refreshCurrentView();
})();
