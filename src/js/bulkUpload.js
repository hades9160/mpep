import * as XLSX from 'xlsx';
import { supabase } from './supabaseClient.js';

// ---------------------------------------------------------------------------
// BULK UPLOAD — Employees, Evaluations (Probationary/Regular), HR Attention,
// 3rd & 5th Month Tracker.
//
// Each config below defines:
//   sheetName   - the tab name expected in the template workbook
//   headers     - the exact column headers used in the template (in order)
//   toPayload   - maps one parsed row (object keyed by header) -> DB payload
//   employeeKey - if set, rows are matched to an employee by name via this field
//   afterInsert - callback to refresh the relevant view
// ---------------------------------------------------------------------------

function cleanStr(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function cleanNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
// Excel/Sheet dates can arrive as JS Date objects, serial numbers, or strings.
function cleanDate(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s; // let DB reject if truly invalid
}
function monthToFirstOfMonth(v) {
  const s = cleanDate(v);
  if (!s) return null;
  return s.slice(0, 7) + '-01';
}

async function findOrCreateEmployeeId(name, employeeCache, extra = {}) {
  const key = (name || '').trim().toLowerCase();
  if (!key) return null;
  if (employeeCache.has(key)) return employeeCache.get(key);
  // Try to find an existing employee first
  const { data: existing } = await supabase
    .from('employees')
    .select('id')
    .ilike('name', name.trim())
    .limit(1);
  if (existing && existing.length) {
    employeeCache.set(key, existing[0].id);
    return existing[0].id;
  }
  // Auto-create a minimal employee record so the row isn't dropped
  const { data: created, error } = await supabase
    .from('employees')
    .insert({
      name: name.trim(),
      position: extra.position || null,
      department: extra.department || null,
      date_hired: extra.date_hired || null,
      employment_type: extra.employment_type || 'Regular',
    })
    .select('id')
    .single();
  if (error || !created) return null;
  employeeCache.set(key, created.id);
  return created.id;
}

export const BULK_CONFIGS = {
  employees: {
    label: 'Employees',
    sheetName: 'Employees',
    headers: ['Full Name', 'Position', 'Department', 'Date Hired (YYYY-MM-DD)', 'Employment Type (Probationary/Regular)'],
    async toPayload(row) {
      const name = cleanStr(row['Full Name']);
      if (!name) return { skip: true, reason: 'Missing Full Name' };
      let type = cleanStr(row['Employment Type (Probationary/Regular)']) || 'Regular';
      type = /prob/i.test(type) ? 'Probationary' : 'Regular';
      return {
        payload: {
          name,
          position: cleanStr(row['Position']),
          department: cleanStr(row['Department']),
          date_hired: cleanDate(row['Date Hired (YYYY-MM-DD)']),
          employment_type: type,
        },
      };
    },
    table: 'employees',
  },

  probationary: {
    label: 'Probationary Evaluations',
    sheetName: 'Probationary Evaluations',
    headers: ['Employee Full Name', 'Reporting Month (YYYY-MM)', 'Stage (e.g. Month 2)', 'Result (Passed/Failed)', 'KPI Score (%)', 'Lates', 'Absences', 'Undertime'],
    employeeKey: 'Employee Full Name',
    employmentTypeDefault: 'Probationary',
    async toPayload(row, employeeCache) {
      const name = cleanStr(row['Employee Full Name']);
      if (!name) return { skip: true, reason: 'Missing Employee Full Name' };
      const month = monthToFirstOfMonth(row['Reporting Month (YYYY-MM)']);
      if (!month) return { skip: true, reason: 'Missing/invalid Reporting Month' };
      const result = cleanStr(row['Result (Passed/Failed)']) || 'Passed';
      const employee_id = await findOrCreateEmployeeId(name, employeeCache, { employment_type: 'Probationary' });
      if (!employee_id) return { skip: true, reason: `Could not resolve employee "${name}"` };
      return {
        payload: {
          employee_id,
          employment_type: 'Probationary',
          reporting_month: month,
          stage: cleanStr(row['Stage (e.g. Month 2)']),
          evaluation_result: /fail/i.test(result) ? 'Failed' : 'Passed',
          kpi_score: cleanNum(row['KPI Score (%)']),
          lates: cleanNum(row['Lates']) || 0,
          absences: cleanNum(row['Absences']) || 0,
          undertime: cleanNum(row['Undertime']) || 0,
        },
      };
    },
    table: 'evaluations',
  },

  regular: {
    label: 'Regular Evaluations',
    sheetName: 'Regular Evaluations',
    headers: ['Employee Full Name', 'Reporting Month (YYYY-MM)', 'Evaluation Period', 'Result', 'KPI Score (%)', 'Lates', 'Absences', 'Undertime', 'Performance Status / Action'],
    employeeKey: 'Employee Full Name',
    async toPayload(row, employeeCache) {
      const name = cleanStr(row['Employee Full Name']);
      if (!name) return { skip: true, reason: 'Missing Employee Full Name' };
      const month = monthToFirstOfMonth(row['Reporting Month (YYYY-MM)']);
      if (!month) return { skip: true, reason: 'Missing/invalid Reporting Month' };
      const allowed = ['Satisfactory', 'Needs Improvement', 'Failed', 'PIP', 'For Review', 'Completed'];
      let result = cleanStr(row['Result']) || 'Satisfactory';
      const match = allowed.find(a => a.toLowerCase() === result.toLowerCase());
      result = match || 'Satisfactory';
      const employee_id = await findOrCreateEmployeeId(name, employeeCache, { employment_type: 'Regular' });
      if (!employee_id) return { skip: true, reason: `Could not resolve employee "${name}"` };
      return {
        payload: {
          employee_id,
          employment_type: 'Regular',
          reporting_month: month,
          stage: cleanStr(row['Evaluation Period']),
          evaluation_result: result,
          kpi_score: cleanNum(row['KPI Score (%)']),
          lates: cleanNum(row['Lates']) || 0,
          absences: cleanNum(row['Absences']) || 0,
          undertime: cleanNum(row['Undertime']) || 0,
          action_notes: cleanStr(row['Performance Status / Action']),
        },
      };
    },
    table: 'evaluations',
  },

  hrAttention: {
    label: 'HR Attention',
    sheetName: 'HR Attention',
    headers: ['Employee Full Name', 'Reporting Month (YYYY-MM)', 'Employment Status', 'Key Performance Issue', 'Coaching / Support', 'Expected Target', 'Next Review Date (YYYY-MM-DD)', 'Recommendation'],
    employeeKey: 'Employee Full Name',
    async toPayload(row, employeeCache) {
      const name = cleanStr(row['Employee Full Name']);
      if (!name) return { skip: true, reason: 'Missing Employee Full Name' };
      const month = monthToFirstOfMonth(row['Reporting Month (YYYY-MM)']);
      if (!month) return { skip: true, reason: 'Missing/invalid Reporting Month' };
      const employee_id = await findOrCreateEmployeeId(name, employeeCache);
      return {
        payload: {
          employee_id,
          reporting_month: month,
          employment_status: cleanStr(row['Employment Status']),
          key_performance_issue: cleanStr(row['Key Performance Issue']),
          coaching_support: cleanStr(row['Coaching / Support']),
          expected_target: cleanStr(row['Expected Target']),
          next_review_date: cleanDate(row['Next Review Date (YYYY-MM-DD)']),
          recommendation: cleanStr(row['Recommendation']),
        },
      };
    },
    table: 'hr_attention',
  },

  thirdFifth: {
    label: '3rd & 5th Month Tracker',
    sheetName: '3rd & 5th Month',
    headers: ['Employee Full Name', 'Department', 'Position', 'Date Hired (YYYY-MM-DD)', '3rd Month Date (YYYY-MM-DD)', '3rd Month Result (Passed/Failed/PIP)', '5th Month Date (YYYY-MM-DD)', '5th Month Result (Qualified/Not Qualified/Review)', 'Final Recommendation', 'Remarks'],
    employeeKey: 'Employee Full Name',
    async toPayload(row, employeeCache) {
      const name = cleanStr(row['Employee Full Name']);
      if (!name) return { skip: true, reason: 'Missing Employee Full Name' };
      const employee_id = await findOrCreateEmployeeId(name, employeeCache, {
        department: cleanStr(row['Department']),
        position: cleanStr(row['Position']),
        date_hired: cleanDate(row['Date Hired (YYYY-MM-DD)']),
      });
      return {
        payload: {
          employee_id,
          department: cleanStr(row['Department']),
          position: cleanStr(row['Position']),
          date_hired: cleanDate(row['Date Hired (YYYY-MM-DD)']),
          third_month_date: cleanDate(row['3rd Month Date (YYYY-MM-DD)']),
          third_month_result: cleanStr(row['3rd Month Result (Passed/Failed/PIP)']),
          fifth_month_date: cleanDate(row['5th Month Date (YYYY-MM-DD)']),
          fifth_month_result: cleanStr(row['5th Month Result (Qualified/Not Qualified/Review)']),
          final_recommendation: cleanStr(row['Final Recommendation']),
          remarks: cleanStr(row['Remarks']),
        },
      };
    },
    table: 'third_fifth_month',
  },
};

function parseFileToRows(file, sheetName) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
        // Prefer the sheet whose name matches; else fall back to the first sheet.
        const name = wb.SheetNames.find(n => n.toLowerCase() === sheetName.toLowerCase()) || wb.SheetNames[0];
        const ws = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Runs a bulk upload for the given config key against the given File.
 * Returns { inserted, skipped, errors: [{row, reason}] }
 */
export async function runBulkUpload(configKey, file, onProgress) {
  const cfg = BULK_CONFIGS[configKey];
  if (!cfg) throw new Error('Unknown bulk upload target: ' + configKey);

  const rows = await parseFileToRows(file, cfg.sheetName);
  const employeeCache = new Map();
  const toInsert = [];
  const errors = [];
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    // Skip fully blank rows
    if (Object.values(row).every(v => v === '' || v === null || v === undefined)) continue;
    const result = await cfg.toPayload(row, employeeCache);
    if (result.skip) {
      skipped++;
      errors.push({ row: i + 2, reason: result.reason }); // +2: header row + 1-index
      continue;
    }
    toInsert.push(result.payload);
    if (onProgress) onProgress(i + 1, rows.length);
  }

  let inserted = 0;
  if (toInsert.length) {
    // Insert in chunks to stay well under request size limits
    const CHUNK = 200;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error, data } = await supabase.from(cfg.table).insert(chunk).select('id');
      if (error) {
        errors.push({ row: `batch ${i / CHUNK + 1}`, reason: error.message });
      } else {
        inserted += (data || chunk).length;
      }
    }
  }

  return { inserted, skipped, total: rows.length, errors };
}
