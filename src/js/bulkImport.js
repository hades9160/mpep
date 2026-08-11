// ============================================================================
// Bulk Import — parses MPEP_Bulk_Upload_Template.xlsx and inserts rows into
// Supabase. Runs entirely in the browser (SheetJS), matching the same
// pattern as the KLMS Excel import tool.
// ============================================================================
import * as XLSX from 'xlsx';
import { supabase } from './supabaseClient.js';

const EXAMPLE_MARKER = 'example';
const VALID_EMPLOYMENT_TYPES = ['Probationary', 'Regular'];
const VALID_EVAL_RESULTS = ['Passed', 'Failed', 'Satisfactory', 'Needs Improvement', 'PIP', 'For Review', 'Completed'];
const VALID_THIRD_RESULTS = ['Passed', 'Failed', 'PIP'];
const VALID_FIFTH_RESULTS = ['Qualified', 'Not Qualified', 'Review'];

function isExampleRow(nameValue) {
  return !nameValue || String(nameValue).trim() === '' ||
    String(nameValue).toLowerCase().includes(EXAMPLE_MARKER);
}

function normDate(value) {
  // sheet_to_json with dateNF already gives us 'yyyy-mm-dd' strings for
  // date-formatted cells. Guard against stray formats / typed text too.
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // MM/DD/YYYY fallback
  if (m2) return `${m2[3]}-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')}`;
  return null;
}

function toReportingMonth(value) {
  const d = normDate(value);
  if (!d) return null;
  return d.slice(0, 8) + '01'; // force first-of-month
}

function readSheet(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
}

function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export async function runBulkImport(file, existingEmployees) {
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: 'array', cellDates: true });

  // Local name -> id map, seeded with employees already in the DB, updated
  // as we insert new ones from the Employees sheet below.
  const nameToId = new Map();
  existingEmployees.forEach(e => nameToId.set(e.name.trim().toLowerCase(), e.id));

  const results = {};

  // ---- 1. Employees ----
  results.employees = await importEmployees(readSheet(workbook, 'Employees'), nameToId);

  // ---- 2. Evaluations ----
  results.evaluations = await importEvaluations(readSheet(workbook, 'Evaluations'), nameToId);

  // ---- 3. HR Attention ----
  results.hrAttention = await importHrAttention(readSheet(workbook, 'HR Attention'), nameToId);

  // ---- 4. 3rd & 5th Month ----
  results.thirdFifth = await importThirdFifth(readSheet(workbook, '3rd & 5th Month'), nameToId);

  return results;
}

// ---------------------------------------------------------------------------
async function importEmployees(rows, nameToId) {
  const toInsert = [];
  const skipped = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2; // account for header row
    const name = row['Full Name*'];
    if (isExampleRow(name)) return; // silently skip example/blank rows, not counted

    const empType = String(row['Employment Type*'] || '').trim();
    if (!VALID_EMPLOYMENT_TYPES.includes(empType)) {
      skipped.push({ row: rowNum, name, reason: `Employment Type must be exactly "Probationary" or "Regular" (got "${row['Employment Type*']}")` });
      return;
    }
    if (nameToId.has(String(name).trim().toLowerCase())) {
      skipped.push({ row: rowNum, name, reason: 'An employee with this exact name already exists — edit them from the Employees tab instead' });
      return;
    }
    toInsert.push({
      _rowNum: rowNum, _name: name,
      name: String(name).trim(),
      position: row['Position'] || null,
      department: row['Department'] || null,
      date_hired: normDate(row['Date Hired (YYYY-MM-DD)']),
      employment_type: empType,
    });
  });

  let added = 0;
  if (toInsert.length) {
    const payload = toInsert.map(({ _rowNum, _name, ...rest }) => rest);
    const { data, error } = await supabase.from('employees').insert(payload).select('id, name');
    if (error) {
      toInsert.forEach(r => skipped.push({ row: r._rowNum, name: r._name, reason: error.message }));
    } else {
      added = data.length;
      data.forEach(e => nameToId.set(e.name.trim().toLowerCase(), e.id));
    }
  }

  return { added, skipped };
}

// ---------------------------------------------------------------------------
async function importEvaluations(rows, nameToId) {
  const toInsert = [];
  const skipped = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const name = row['Employee Name*'];
    if (isExampleRow(name)) return;

    const employeeId = nameToId.get(String(name).trim().toLowerCase());
    if (!employeeId) {
      skipped.push({ row: rowNum, name, reason: 'No employee with this exact name found — add them in the Employees sheet/tab first' });
      return;
    }
    const empType = String(row['Employment Type*'] || '').trim();
    if (!VALID_EMPLOYMENT_TYPES.includes(empType)) {
      skipped.push({ row: rowNum, name, reason: `Employment Type must be "Probationary" or "Regular" (got "${row['Employment Type*']}")` });
      return;
    }
    const reportingMonth = toReportingMonth(row['Reporting Month (YYYY-MM-01)*']);
    if (!reportingMonth) {
      skipped.push({ row: rowNum, name, reason: `Reporting Month is missing or not a valid date (got "${row['Reporting Month (YYYY-MM-01)*']}")` });
      return;
    }
    const result = String(row['Evaluation Result*'] || '').trim();
    if (!VALID_EVAL_RESULTS.includes(result)) {
      skipped.push({ row: rowNum, name, reason: `Evaluation Result "${row['Evaluation Result*']}" is not a valid option` });
      return;
    }

    toInsert.push({
      _rowNum: rowNum, _name: name,
      employee_id: employeeId,
      employment_type: empType,
      reporting_month: reportingMonth,
      stage: row['Stage / Period'] || null,
      evaluation_result: result,
      kpi_score: num(row['KPI Score (%)']),
      lates: num(row['Lates']) || 0,
      absences: num(row['Absences']) || 0,
      undertime: num(row['Undertime']) || 0,
      action_notes: row['Action Notes'] || null,
    });
  });

  let added = 0;
  if (toInsert.length) {
    const payload = toInsert.map(({ _rowNum, _name, ...rest }) => rest);
    const { data, error } = await supabase.from('evaluations').insert(payload).select('id');
    if (error) {
      toInsert.forEach(r => skipped.push({ row: r._rowNum, name: r._name, reason: error.message }));
    } else {
      added = data.length;
    }
  }

  return { added, skipped };
}

// ---------------------------------------------------------------------------
async function importHrAttention(rows, nameToId) {
  const toInsert = [];
  const skipped = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const name = row['Employee Name*'];
    if (isExampleRow(name)) return;

    const employeeId = nameToId.get(String(name).trim().toLowerCase()) || null;
    if (!employeeId) {
      skipped.push({ row: rowNum, name, reason: 'No employee with this exact name found — add them in the Employees sheet/tab first' });
      return;
    }
    const reportingMonth = toReportingMonth(row['Reporting Month (YYYY-MM-01)*']);
    if (!reportingMonth) {
      skipped.push({ row: rowNum, name, reason: `Reporting Month is missing or not a valid date (got "${row['Reporting Month (YYYY-MM-01)*']}")` });
      return;
    }

    toInsert.push({
      _rowNum: rowNum, _name: name,
      employee_id: employeeId,
      reporting_month: reportingMonth,
      employment_status: row['Employment Status'] || null,
      key_performance_issue: row['Key Performance Issue'] || null,
      coaching_support: row['Coaching / Support Provided'] || null,
      expected_target: row['Expected Target'] || null,
      next_review_date: normDate(row['Next Review Date (YYYY-MM-DD)']),
      recommendation: row['Recommendation'] || null,
    });
  });

  let added = 0;
  if (toInsert.length) {
    const payload = toInsert.map(({ _rowNum, _name, ...rest }) => rest);
    const { data, error } = await supabase.from('hr_attention').insert(payload).select('id');
    if (error) {
      toInsert.forEach(r => skipped.push({ row: r._rowNum, name: r._name, reason: error.message }));
    } else {
      added = data.length;
    }
  }

  return { added, skipped };
}

// ---------------------------------------------------------------------------
async function importThirdFifth(rows, nameToId) {
  const toInsert = [];
  const skipped = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const name = row['Employee Name*'];
    if (isExampleRow(name)) return;

    const employeeId = nameToId.get(String(name).trim().toLowerCase()) || null;
    if (!employeeId) {
      skipped.push({ row: rowNum, name, reason: 'No employee with this exact name found — add them in the Employees sheet/tab first' });
      return;
    }
    const thirdResult = String(row['3rd Month Result'] || '').trim();
    if (thirdResult && !VALID_THIRD_RESULTS.includes(thirdResult)) {
      skipped.push({ row: rowNum, name, reason: `3rd Month Result "${thirdResult}" is not a valid option` });
      return;
    }
    const fifthResult = String(row['5th Month Result'] || '').trim();
    if (fifthResult && !VALID_FIFTH_RESULTS.includes(fifthResult)) {
      skipped.push({ row: rowNum, name, reason: `5th Month Result "${fifthResult}" is not a valid option` });
      return;
    }

    toInsert.push({
      _rowNum: rowNum, _name: name,
      employee_id: employeeId,
      department: row['Department'] || null,
      position: row['Position'] || null,
      date_hired: normDate(row['Date Hired (YYYY-MM-DD)']),
      third_month_date: normDate(row['3rd Month Date']),
      third_month_result: thirdResult || null,
      fifth_month_date: normDate(row['5th Month Date']),
      fifth_month_result: fifthResult || null,
      final_recommendation: row['Final Recommendation'] || null,
      remarks: row['Remarks'] || null,
    });
  });

  let added = 0;
  if (toInsert.length) {
    const payload = toInsert.map(({ _rowNum, _name, ...rest }) => rest);
    const { data, error } = await supabase.from('third_fifth_month').insert(payload).select('id');
    if (error) {
      toInsert.forEach(r => skipped.push({ row: r._rowNum, name: r._name, reason: error.message }));
    } else {
      added = data.length;
    }
  }

  return { added, skipped };
}
