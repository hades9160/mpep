// ============================================================================
// BACKUP WORKBOOK — builds (and parses back) the styled Excel backup file.
//
// This module is deliberately free of DOM and Supabase imports: it takes plain
// row arrays in, hands a workbook out, and reads a workbook back into plain
// row arrays. That keeps the formatting logic testable on its own and means
// the same spec drives both export and restore, so the two can never drift
// apart (a header renamed here is renamed on both sides at once).
//
// Uses ExcelJS rather than SheetJS: the community build of SheetJS cannot
// write cell styling (fills, fonts, borders, number formats), which is the
// whole point of this file. SheetJS stays in the project for Bulk Import.
// ============================================================================
// ExcelJS is loaded on demand rather than at the top level: it is a ~1 MB
// dependency and only two buttons in the whole app need it, so a static
// import would push it into the main bundle and slow down every page load.
// Vite code-splits this into its own chunk, fetched the first time someone
// downloads or restores a backup.
let _ExcelJS = null;
async function getExcelJS() {
  if (!_ExcelJS) {
    const mod = await import('exceljs');
    _ExcelJS = mod.default || mod;
  }
  return _ExcelJS;
}

export const BACKUP_FORMAT = 'MPEP Excel Backup v1';

// --- Brand palette, mirrored from src/css/style.css -------------------------
const C = {
  navy950: 'FF081527',
  navy900: 'FF0B1F3A',
  navy800: 'FF122A4D',
  navy700: 'FF1B3A64',
  amber500: 'FFF5A623',
  amber100: 'FFFFF3DC',
  slate50: 'FFF7F8FA',
  slate100: 'FFEEF1F5',
  slate200: 'FFDCE1E8',
  slate400: 'FF94A0B2',
  slate600: 'FF566073',
  slate800: 'FF2B3446',
  white: 'FFFFFFFF',
};

const FONT = 'Arial';

// Result-value colour coding, matching the badge colours used in the app.
const RESULT_STYLES = {
  'Passed':            { bg: 'FFE6F4EA', fg: 'FF1E7A43' },
  'Satisfactory':      { bg: 'FFE6F4EA', fg: 'FF1E7A43' },
  'Completed':         { bg: 'FFE6F4EA', fg: 'FF1E7A43' },
  'Qualified':         { bg: 'FFE6F4EA', fg: 'FF1E7A43' },
  'Failed':            { bg: 'FFFBE9E7', fg: 'FFB3382E' },
  'Not Qualified':     { bg: 'FFFBE9E7', fg: 'FFB3382E' },
  'Needs Improvement': { bg: 'FFFFF3DC', fg: 'FF8A6100' },
  'PIP':               { bg: 'FFFFF3DC', fg: 'FF8A6100' },
  'Review':            { bg: 'FFFFF3DC', fg: 'FF8A6100' },
  'For Review':        { bg: 'FFE8F0FC', fg: 'FF2A5BA8' },
};

// ============================================================================
// TABLE SPECS — the single source of truth for the backup file's shape.
//
//   key      database column name ('' for a derived, read-only helper column)
//   header   the text written in the header row; also what restore matches on
//   type     text | longtext | date | iso | number | int | result
//   system   true  => hidden, grey column (IDs and timestamps). Still read on
//            restore — the row IDs are what make a restore an update rather
//            than a duplicate insert.
//   derived  filled in for display only; ignored entirely on restore
// ============================================================================
export const TABLE_SPECS = [
  {
    table: 'employees',
    sheet: 'Employees',
    conflict: 'id',
    label: 'Master employee list',
    columns: [
      { key: 'name',            header: 'Full Name',        type: 'text',   width: 28 },
      { key: 'position',        header: 'Position',         type: 'text',   width: 24 },
      { key: 'department',      header: 'Department',       type: 'text',   width: 20 },
      { key: 'date_hired',      header: 'Date Hired',       type: 'date',   width: 14 },
      { key: 'employment_type', header: 'Employment Type',  type: 'text',   width: 18 },
      { key: 'created_at',      header: 'Created At',       type: 'iso',    width: 26, system: true },
      { key: 'id',              header: 'Employee ID',      type: 'text',   width: 38, system: true },
    ],
  },
  {
    table: 'evaluations',
    sheet: 'Evaluations',
    conflict: 'id',
    label: 'Monthly performance evaluations',
    columns: [
      { key: '',                 header: 'Employee Name',     type: 'text',     width: 28, derived: 'employeeName' },
      { key: 'employment_type',  header: 'Employment Type',   type: 'text',     width: 17 },
      { key: 'reporting_month',  header: 'Reporting Month',   type: 'date',     width: 16 },
      { key: 'stage',            header: 'Stage / Period',    type: 'text',     width: 16 },
      { key: 'evaluation_result',header: 'Evaluation Result', type: 'result',   width: 19 },
      { key: 'kpi_score',        header: 'KPI Score (%)',     type: 'number',   width: 13 },
      { key: 'lates',            header: 'Lates',             type: 'int',      width: 10 },
      { key: 'absences',         header: 'Absences',          type: 'int',      width: 12 },
      { key: 'undertime',        header: 'Undertime',         type: 'int',      width: 12 },
      { key: 'action_notes',     header: 'Action Notes',      type: 'longtext', width: 42 },
      { key: 'created_at',       header: 'Created At',        type: 'iso',      width: 26, system: true },
      { key: 'updated_at',       header: 'Updated At',        type: 'iso',      width: 26, system: true },
      { key: 'employee_id',      header: 'Employee ID',       type: 'text',     width: 38, system: true },
      { key: 'id',               header: 'Evaluation ID',     type: 'text',     width: 38, system: true },
    ],
  },
  {
    table: 'hr_attention',
    sheet: 'HR Attention',
    conflict: 'id',
    label: 'Employees requiring HR / management attention',
    columns: [
      { key: '',                      header: 'Employee Name',           type: 'text',     width: 28, derived: 'employeeName' },
      { key: 'reporting_month',       header: 'Reporting Month',         type: 'date',     width: 16 },
      { key: 'employment_status',     header: 'Employment Status',       type: 'text',     width: 18 },
      { key: 'key_performance_issue', header: 'Key Performance Issue',   type: 'longtext', width: 36 },
      { key: 'coaching_support',      header: 'Coaching / Support',      type: 'longtext', width: 36 },
      { key: 'expected_target',       header: 'Expected Target',         type: 'longtext', width: 30 },
      { key: 'next_review_date',      header: 'Next Review Date',        type: 'date',     width: 16 },
      { key: 'recommendation',        header: 'Recommendation',          type: 'longtext', width: 30 },
      { key: 'created_at',            header: 'Created At',              type: 'iso',      width: 26, system: true },
      { key: 'employee_id',           header: 'Employee ID',             type: 'text',     width: 38, system: true },
      { key: 'id',                    header: 'HR Attention ID',         type: 'text',     width: 38, system: true },
    ],
  },
  {
    table: 'third_fifth_month',
    sheet: '3rd & 5th Month',
    conflict: 'id',
    label: 'Probationary regularization tracker',
    columns: [
      { key: '',                     header: 'Employee Name',        type: 'text',     width: 28, derived: 'employeeName' },
      { key: 'department',           header: 'Department',           type: 'text',     width: 20 },
      { key: 'position',             header: 'Position',             type: 'text',     width: 24 },
      { key: 'date_hired',           header: 'Date Hired',           type: 'date',     width: 14 },
      { key: 'third_month_date',     header: '3rd Month Date',       type: 'date',     width: 15 },
      { key: 'third_month_result',   header: '3rd Month Result',     type: 'result',   width: 17 },
      { key: 'fifth_month_date',     header: '5th Month Date',       type: 'date',     width: 15 },
      { key: 'fifth_month_result',   header: '5th Month Result',     type: 'result',   width: 17 },
      { key: 'final_recommendation', header: 'Final Recommendation', type: 'longtext', width: 32 },
      { key: 'remarks',              header: 'Remarks',              type: 'longtext', width: 32 },
      { key: 'created_at',           header: 'Created At',           type: 'iso',      width: 26, system: true },
      { key: 'employee_id',          header: 'Employee ID',          type: 'text',     width: 38, system: true },
      { key: 'id',                   header: 'Tracker ID',           type: 'text',     width: 38, system: true },
    ],
  },
  {
    table: 'sign_off',
    sheet: 'Sign-Off',
    conflict: 'reporting_month',
    label: 'Report preparation & review sign-off (legacy table)',
    optional: true,
    columns: [
      { key: 'reporting_month',        header: 'Reporting Month',      type: 'date', width: 16 },
      { key: 'prepared_by',            header: 'Prepared By',          type: 'text', width: 24 },
      { key: 'prepared_date',          header: 'Prepared Date',        type: 'date', width: 14 },
      { key: 'department_head',        header: 'Department Head',      type: 'text', width: 24 },
      { key: 'department_head_date',   header: 'Dept Head Date',       type: 'date', width: 14 },
      { key: 'hr_representative',      header: 'HR Representative',    type: 'text', width: 24 },
      { key: 'hr_representative_date', header: 'HR Rep Date',          type: 'date', width: 14 },
      { key: 'management_approval',    header: 'Management Approval',  type: 'text', width: 24 },
      { key: 'management_date',        header: 'Management Date',      type: 'date', width: 14 },
      { key: 'id',                     header: 'Sign-Off ID',          type: 'text', width: 38, system: true },
    ],
  },
  {
    table: 'progress_highlights',
    sheet: 'Progress Highlights',
    conflict: 'reporting_month',
    label: 'Monthly narrative summary (legacy table)',
    optional: true,
    columns: [
      { key: 'reporting_month',        header: 'Reporting Month',        type: 'date',     width: 16 },
      { key: 'key_improvements',       header: 'Key Improvements',       type: 'longtext', width: 36 },
      { key: 'common_gaps',            header: 'Common Gaps',            type: 'longtext', width: 36 },
      { key: 'attendance_concerns',    header: 'Attendance Concerns',    type: 'longtext', width: 32 },
      { key: 'training_needs',         header: 'Training Needs',         type: 'longtext', width: 32 },
      { key: 'overall_recommendation', header: 'Overall Recommendation', type: 'longtext', width: 36 },
      { key: 'updated_at',             header: 'Updated At',             type: 'iso',      width: 26, system: true },
      { key: 'id',                     header: 'Highlight ID',           type: 'text',     width: 38, system: true },
    ],
  },
];

export const BACKUP_TABLES = TABLE_SPECS.map(s => s.table);

// ---------------------------------------------------------------------------
// Date helpers. Every date is written as a real Excel date built at UTC
// midnight and read back with the UTC getters, so the value survives a
// round-trip untouched regardless of the machine's timezone. This is the same
// trap that the v3 Reporting Month fix dealt with — see src/js/utils.js.
// ---------------------------------------------------------------------------
function dateStrToExcel(value) {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function excelToDateStr(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const mo = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  const s = String(value).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // MM/DD/YYYY typed by hand
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

function normHeader(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function cellText(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    if (v instanceof Date) return v.toISOString();
  }
  return String(v);
}

// Estimates how many lines a wrapped value needs in a column of the given
// width, so row heights fit their content instead of clipping it. Excel will
// not auto-fit a row we have explicitly styled, so we size it ourselves.
function wrappedLines(text, width) {
  const s = String(text ?? '');
  if (!s) return 1;
  const usable = Math.max(6, width - 2);
  let lines = 0;
  for (const part of s.split(/\r?\n/)) {
    lines += Math.max(1, Math.ceil(part.length / usable));
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Shared style fragments
// ---------------------------------------------------------------------------
const thin = { style: 'thin', color: { argb: C.slate200 } };
const CELL_BORDER = { top: thin, left: thin, bottom: thin, right: thin };

function fill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function bandRow(ws, rowNum, text, opts = {}) {
  const {
    lastCol = 6, bg = C.navy900, color = C.white,
    size = 11, bold = true, height = 22, italic = false, align = 'left',
  } = opts;
  ws.mergeCells(rowNum, 1, rowNum, lastCol);
  const row = ws.getRow(rowNum);
  row.height = height;
  const cell = ws.getCell(rowNum, 1);
  cell.value = text;
  cell.font = { name: FONT, size, bold, italic, color: { argb: color } };
  cell.alignment = { vertical: 'middle', horizontal: align, indent: 1 };
  for (let c = 1; c <= lastCol; c++) ws.getCell(rowNum, c).fill = fill(bg);
  return cell;
}

// ============================================================================
// COVER SHEET
// ============================================================================
// Combined width of the merged A:D block the cover's prose sits in.
const COVER_TEXT_WIDTH = 22 + 30 + 12 + 34;

function buildCoverSheet(wb, { generatedAt, generatedBy, counts, skipped }) {
  const ws = wb.addWorksheet('Backup Info', {
    properties: { tabColor: { argb: C.amber500 } },
    views: [{ showGridLines: false }],
    pageSetup: {
      orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });
  ws.columns = [
    { width: 22 }, { width: 30 }, { width: 12 }, { width: 34 }, { width: 3 }, { width: 3 },
  ];

  bandRow(ws, 1, 'AURION SOLAR', { bg: C.navy950, color: C.amber500, size: 16, height: 30 });
  bandRow(ws, 2, 'MPEP — Monthly Performance Evaluation Progress', { bg: C.navy900, size: 12, height: 22 });
  bandRow(ws, 3, 'Full Database Backup', { bg: C.amber500, color: C.navy950, size: 11, height: 20 });

  ws.getRow(4).height = 8;

  // --- Metadata block ---
  const meta = [
    ['Generated', generatedAt.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })],
    ['Generated by', generatedBy || '—'],
    ['Format', BACKUP_FORMAT],
    ['Source', 'Supabase (PostgreSQL) — MPEP project'],
  ];
  meta.forEach(([label, value], i) => {
    const r = 5 + i;
    const a = ws.getCell(r, 1);
    const b = ws.getCell(r, 2);
    a.value = label;
    a.font = { name: FONT, size: 10, bold: true, color: { argb: C.slate600 } };
    a.alignment = { vertical: 'middle', indent: 1 };
    a.fill = fill(C.slate100);
    a.border = CELL_BORDER;
    b.value = value;
    b.font = { name: FONT, size: 10, color: { argb: C.slate800 } };
    b.alignment = { vertical: 'middle', indent: 1 };
    b.border = CELL_BORDER;
    ws.getRow(r).height = 18;
  });

  ws.getRow(9).height = 10;

  // --- Contents table ---
  bandRow(ws, 10, 'CONTENTS', { lastCol: 4, bg: C.navy800, size: 10, height: 20 });

  const headRow = ws.getRow(11);
  headRow.height = 20;
  ['Sheet', 'Database table', 'Records', 'What it holds'].forEach((h, i) => {
    const cell = ws.getCell(11, i + 1);
    cell.value = h;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
    cell.fill = fill(C.navy700);
    cell.alignment = { vertical: 'middle', horizontal: i === 2 ? 'center' : 'left', indent: i === 2 ? 0 : 1 };
    cell.border = CELL_BORDER;
  });

  let r = 12;
  let firstDataRow = r;
  TABLE_SPECS.forEach((spec, i) => {
    const n = counts[spec.table];
    const present = n !== undefined;
    const zebra = i % 2 === 1;
    const cells = [
      spec.sheet,
      spec.table,
      // Counted with a live formula so the number stays honest if rows are
      // added or deleted in the sheet before a restore.
      present
        ? { formula: `COUNTA('${spec.sheet}'!A5:A100000)`, result: n }
        : 'not in database',
      spec.label,
    ];
    cells.forEach((v, ci) => {
      const cell = ws.getCell(r, ci + 1);
      cell.value = v;
      cell.font = {
        name: FONT, size: 10,
        color: { argb: present ? C.slate800 : C.slate400 },
        italic: !present,
        bold: ci === 0,
      };
      cell.alignment = { vertical: 'middle', horizontal: ci === 2 ? 'center' : 'left', indent: ci === 2 ? 0 : 1 };
      cell.border = CELL_BORDER;
      if (zebra) cell.fill = fill(C.slate50);
      if (ci === 2 && present) cell.numFmt = '#,##0';
    });
    ws.getRow(r).height = 17;
    r++;
  });

  const totalRow = r;
  ws.getCell(totalRow, 1).value = 'TOTAL RECORDS';
  ws.mergeCells(totalRow, 1, totalRow, 2);
  ws.getCell(totalRow, 3).value = {
    formula: `SUM(C${firstDataRow}:C${totalRow - 1})`,
    result: Object.values(counts).reduce((a, b) => a + b, 0),
  };
  [1, 2, 3, 4].forEach(c => {
    const cell = ws.getCell(totalRow, c);
    cell.fill = fill(C.amber100);
    cell.border = CELL_BORDER;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.navy900 } };
    cell.alignment = { vertical: 'middle', horizontal: c === 3 ? 'center' : 'left', indent: c === 3 ? 0 : 1 };
  });
  ws.getCell(totalRow, 3).numFmt = '#,##0';
  ws.getRow(totalRow).height = 19;

  r = totalRow + 2;

  // --- Restore instructions ---
  bandRow(ws, r, 'HOW TO RESTORE THIS BACKUP', { lastCol: 4, bg: C.navy800, size: 10, height: 20 });
  r++;
  const steps = [
    'Open the dashboard and sign in, then go to Backup & Restore in the sidebar.',
    'Under "Restore from a backup", choose this .xlsx file.',
    'Click "Restore from File" and confirm the warning.',
    'Records are matched by their ID column — an existing record with the same ID is updated, a new ID is added. Nothing is deleted.',
  ];
  steps.forEach((text, i) => {
    ws.mergeCells(r, 1, r, 4);
    const cell = ws.getCell(r, 1);
    cell.value = `${i + 1}.  ${text}`;
    cell.font = { name: FONT, size: 10, color: { argb: C.slate800 } };
    cell.alignment = { vertical: 'top', wrapText: true, indent: 1 };
    ws.getRow(r).height = 3 + wrappedLines(cell.value, COVER_TEXT_WIDTH) * 13;
    r++;
  });

  r++;
  // --- Warning block ---
  bandRow(ws, r, '⚠  BEFORE YOU EDIT ANYTHING IN THIS FILE', { lastCol: 4, bg: C.amber500, color: C.navy950, size: 10, height: 20 });
  r++;
  const warnings = [
    'Each data sheet has hidden ID columns on the far right (select the surrounding columns → right-click → Unhide to see them). Those IDs are what let a restore update the right record instead of creating a duplicate. Do not edit or clear them.',
    'You may safely correct values, and you may delete whole rows you do not want restored.',
    'Do not rename the sheets or the header row — the restore matches on those exact names.',
    'Leave the ID blank on a brand-new row you type in yourself; the database will generate one on restore.',
  ];
  warnings.forEach(text => {
    ws.mergeCells(r, 1, r, 4);
    const cell = ws.getCell(r, 1);
    cell.value = `•  ${text}`;
    cell.font = { name: FONT, size: 10, color: { argb: C.slate800 } };
    cell.alignment = { vertical: 'top', wrapText: true, indent: 1 };
    cell.fill = fill(C.amber100);
    cell.border = { left: thin, right: thin, top: thin, bottom: thin };
    ws.getRow(r).height = 6 + wrappedLines(cell.value, COVER_TEXT_WIDTH) * 13;
    r++;
  });

  if (skipped?.length) {
    r++;
    bandRow(ws, r, 'TABLES SKIPPED', { lastCol: 4, bg: C.slate200, color: C.slate800, size: 10, height: 18 });
    r++;
    skipped.forEach(s => {
      ws.mergeCells(r, 1, r, 4);
      const cell = ws.getCell(r, 1);
      cell.value = `${s.table}: ${s.reason}`;
      cell.font = { name: FONT, size: 9, italic: true, color: { argb: C.slate600 } };
      cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
      ws.getRow(r).height = 15;
      r++;
    });
  }

  return ws;
}

// ============================================================================
// DATA SHEETS
// ============================================================================
const HEADER_ROW = 4;   // rows 1-3 are the title band, data starts at row 5

function buildDataSheet(wb, spec, rows, employeeNameById, generatedAt) {
  const ws = wb.addWorksheet(spec.sheet, {
    properties: { tabColor: { argb: C.navy700 } },
    views: [{
      state: 'frozen',
      xSplit: 1,             // keep the name / first column visible
      ySplit: HEADER_ROW,
      showGridLines: false,
    }],
    pageSetup: {
      orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  const cols = spec.columns;
  const lastCol = cols.length;

  ws.columns = cols.map(c => ({ width: c.width, hidden: !!c.system }));

  // --- Title band -----------------------------------------------------------
  bandRow(ws, 1, `AURION SOLAR  ·  MPEP DATABASE BACKUP`, {
    lastCol, bg: C.navy950, color: C.amber500, size: 11, height: 24,
  });
  bandRow(ws, 2, spec.sheet.toUpperCase(), {
    lastCol, bg: C.navy900, size: 14, height: 26,
  });
  bandRow(ws, 3,
    `${spec.label}   ·   ${rows.length} record${rows.length === 1 ? '' : 's'}   ·   table: ${spec.table}   ·   generated ${generatedAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
    { lastCol, bg: C.slate100, color: C.slate600, size: 9, bold: false, italic: true, height: 17 }
  );

  // --- Header row -----------------------------------------------------------
  const header = ws.getRow(HEADER_ROW);
  header.height = 28;
  cols.forEach((c, i) => {
    const cell = ws.getCell(HEADER_ROW, i + 1);
    cell.value = c.header;
    cell.font = {
      name: FONT, size: 10, bold: true,
      color: { argb: c.system ? C.slate200 : C.white },
    };
    cell.fill = fill(c.system ? C.slate600 : C.navy800);
    const centred = c.type === 'number' || c.type === 'int' || c.type === 'date' || c.type === 'result';
    cell.alignment = {
      vertical: 'middle',
      horizontal: centred ? 'center' : 'left',
      wrapText: true,
      indent: centred ? 0 : 1,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: C.navy800 } },
      left: { style: 'thin', color: { argb: C.navy700 } },
      right: { style: 'thin', color: { argb: C.navy700 } },
      bottom: { style: 'medium', color: { argb: C.amber500 } },
    };
  });

  // --- Data rows ------------------------------------------------------------
  rows.forEach((rowData, idx) => {
    const rowNum = HEADER_ROW + 1 + idx;
    const row = ws.getRow(rowNum);
    const zebra = idx % 2 === 1;

    cols.forEach((c, i) => {
      const cell = ws.getCell(rowNum, i + 1);
      let value = null;

      if (c.derived === 'employeeName') {
        value = employeeNameById.get(rowData.employee_id) || (rowData.employee_id ? '(deleted employee)' : '—');
      } else {
        value = rowData[c.key];
      }

      // --- value + number format by type ---
      if (value === null || value === undefined || value === '') {
        cell.value = null;
      } else if (c.type === 'date') {
        const d = dateStrToExcel(value);
        if (d) { cell.value = d; cell.numFmt = 'yyyy-mm-dd'; }
        else cell.value = String(value);
      } else if (c.type === 'number') {
        const n = Number(value);
        cell.value = isNaN(n) ? String(value) : n;
        cell.numFmt = '0.00';
      } else if (c.type === 'int') {
        const n = Number(value);
        cell.value = isNaN(n) ? String(value) : n;
        cell.numFmt = '#,##0';
      } else {
        cell.value = String(value);
      }

      // --- styling ---
      cell.font = {
        name: FONT, size: 10,
        color: { argb: c.system ? C.slate400 : C.slate800 },
        italic: !!c.system,
      };
      cell.border = CELL_BORDER;
      cell.alignment = {
        vertical: c.type === 'longtext' ? 'top' : 'middle',
        horizontal: (c.type === 'number' || c.type === 'int') ? 'center'
          : c.type === 'date' ? 'center' : 'left',
        wrapText: c.type === 'longtext',
        indent: (c.type === 'number' || c.type === 'int' || c.type === 'date') ? 0 : 1,
      };
      if (zebra) cell.fill = fill(C.slate50);

      // Result columns get their badge colour, so a Failed row is findable
      // at a glance the same way it is in the app.
      if (c.type === 'result' && value) {
        const s = RESULT_STYLES[String(value).trim()];
        if (s) {
          cell.fill = fill(s.bg);
          cell.font = { name: FONT, size: 10, bold: true, color: { argb: s.fg } };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      }
    });

    // Height driven by the tallest wrapped cell in the row (capped, so one
    // very long note cannot produce a page-tall row).
    let lines = 1;
    for (const c of cols) {
      if (c.type !== 'longtext' || c.system) continue;
      const v = c.derived ? '' : rowData[c.key];
      lines = Math.max(lines, wrappedLines(v, c.width));
    }
    row.height = Math.min(1 + Math.min(lines, 6) * 12.5, 80);
  });

  // Empty-state note so a blank sheet doesn't look broken.
  if (!rows.length) {
    const cell = ws.getCell(HEADER_ROW + 1, 1);
    ws.mergeCells(HEADER_ROW + 1, 1, HEADER_ROW + 1, Math.min(lastCol, 6));
    cell.value = 'No records in this table at the time of backup.';
    cell.font = { name: FONT, size: 10, italic: true, color: { argb: C.slate400 } };
    cell.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(HEADER_ROW + 1).height = 20;
  }

  // --- Autofilter over the visible header + data ----------------------------
  ws.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: HEADER_ROW + Math.max(rows.length, 1), column: lastCol },
  };

  return ws;
}

// ============================================================================
// PUBLIC: build the workbook
//
//   tables  { employees: [...], evaluations: [...], ... }
//   skipped [{ table, reason }]   tables that could not be read
// ============================================================================
export async function buildBackupWorkbook({ tables, skipped = [], generatedBy = '', generatedAt = new Date() }) {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MPEP — Aurion Solar';
  wb.lastModifiedBy = generatedBy || 'MPEP';
  wb.created = generatedAt;
  wb.modified = generatedAt;
  wb.title = 'MPEP Database Backup';
  wb.description = BACKUP_FORMAT;
  wb.company = 'Aurion Solar';

  const employeeNameById = new Map(
    (tables.employees || []).map(e => [e.id, e.name])
  );

  const counts = {};
  for (const spec of TABLE_SPECS) {
    if (!tables[spec.table]) continue;
    counts[spec.table] = tables[spec.table].length;
  }

  buildCoverSheet(wb, { generatedAt, generatedBy, counts, skipped });

  for (const spec of TABLE_SPECS) {
    const rows = tables[spec.table];
    if (!rows) continue;                 // table missing from the database
    buildDataSheet(wb, spec, rows, employeeNameById, generatedAt);
  }

  return wb;
}

// ============================================================================
// PUBLIC: parse a backup workbook back into rows
//
// Returns { tables: { <table>: [rows] }, warnings: [string] }
// Derived columns (Employee Name) are ignored — the employee_id in the hidden
// column is the real link.
// ============================================================================
export async function parseBackupWorkbook(arrayBuffer) {
  const ExcelJS = await getExcelJS();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  const tables = {};
  const warnings = [];
  let matchedAnySheet = false;

  for (const spec of TABLE_SPECS) {
    const ws = wb.getWorksheet(spec.sheet);
    if (!ws) continue;

    // Locate the header row rather than trusting a fixed offset, so the file
    // still restores if someone inserts a note row above the table.
    const wanted = new Map(spec.columns.map(c => [normHeader(c.header), c]));
    let headerRowNum = null;
    let colMap = null;

    for (let r = 1; r <= Math.min(ws.rowCount, 15); r++) {
      const row = ws.getRow(r);
      const found = new Map();
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const c = wanted.get(normHeader(cellText(cell)));
        if (c && !found.has(c.header)) found.set(c.header, colNumber);
      });
      if (found.size >= 2) { headerRowNum = r; colMap = found; break; }
    }

    if (!headerRowNum) {
      warnings.push(`Sheet "${spec.sheet}" was found but its header row could not be recognised — skipped.`);
      continue;
    }
    matchedAnySheet = true;

    const rows = [];
    for (let r = headerRowNum + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const obj = {};
      let hasValue = false;

      for (const c of spec.columns) {
        if (c.derived) continue;                    // display-only helper column
        const colNumber = colMap.get(c.header);
        if (!colNumber) continue;
        const cell = row.getCell(colNumber);
        const raw = cell.value;

        let out = null;
        if (raw === null || raw === undefined || raw === '') {
          out = null;
        } else if (c.type === 'date') {
          out = excelToDateStr(raw instanceof Date ? raw : cellText(cell));
        } else if (c.type === 'number' || c.type === 'int') {
          const n = Number(cellText(cell));
          out = isNaN(n) ? null : n;
        } else {
          out = cellText(cell).trim() || null;
        }

        if (out !== null) hasValue = true;
        obj[c.key] = out;
      }

      if (!hasValue) continue;                       // blank / spacer row

      // A row typed in by hand with no ID is fine — let the database mint one.
      if (!obj.id) delete obj.id;
      // Same for server-managed timestamps left blank.
      if (!obj.created_at) delete obj.created_at;
      if (!obj.updated_at) delete obj.updated_at;

      rows.push(obj);
    }

    tables[spec.table] = rows;
  }

  if (!matchedAnySheet) {
    throw new Error('This file does not look like an MPEP Excel backup — none of the expected sheets were found.');
  }

  return { tables, warnings };
}
