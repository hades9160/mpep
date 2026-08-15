// ============================================================================
// Shared app state. Exported as a single mutable object (not separate `let`
// exports) because ES modules only let the module that declares a `let`
// reassign it — every other module can only read it. Using one object and
// mutating its properties (store.selectedMonth = ...) works fine everywhere.
// ============================================================================
export const store = {
  currentUser: null,
  selectedMonth: null,   // 'YYYY-MM-01'
  employees: [],          // cache of all employees, refreshed via loadEmployees()
  lastProbRows: [],        // last-fetched probationary roster+eval rows, for client-side filtering
  lastRegRows: [],          // same for regular
  lastTfRows: [],            // same for 3rd/5th month roster
  editingId: null,            // id currently being edited in the generic modal
  editingTable: null,          // supabase table currently being edited
};
