# MPEP — Monthly Performance Evaluation Progress Dashboard

npm + Vite version of the Aurion Solar performance dashboard. Same features
as before (Employees, Probationary, Regular, HR Attention, 3rd & 5th Month,
Progress Highlights, Sign-Off, Dashboard with charts) — now with a proper
build step, `npm install`/`npm run dev` workflow, and Supabase keys read
from a `.env` file instead of being hardcoded in a committed JS file.

## What changed from the plain HTML/CSS/JS version

- `package.json` + `vite.config.js` — real build tooling, multi-page (login
  + dashboard) build.
- `@supabase/supabase-js` and `chart.js` are now real npm dependencies,
  imported with ES `import` statements — no more CDN `<script>` tags.
- Supabase URL/key now come from environment variables (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`) via a `.env` file, which is git-ignored so your
  keys never get committed.
- Source files live under `src/` (`src/js/`, `src/css/`); `index.html` and
  `login.html` stay at the project root (Vite convention).

## 1. Install dependencies

```bash
cd mpep
npm install
```

## 2. Set up your environment file

A `.env` file with your real Supabase project's URL and anon key is
**already included** in this delivery so it works immediately. If you ever
need to point it at a different Supabase project, edit `.env` directly:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

(`.env.example` is the template others should copy if they clone this repo
fresh — `.env` itself is git-ignored on purpose, so double check it doesn't
get committed if you `git add .`.)

## 3. Run it locally

```bash
npm run dev
```

Vite will print a local URL (usually `http://localhost:5173`). Open
`http://localhost:5173/login.html` and sign in with an account you created
in Supabase Authentication → Users.

## 4. Build for production

```bash
npm run build
```

This outputs a static `dist/` folder — plain HTML/CSS/JS, ready to host
anywhere. `npm run preview` lets you sanity-check the production build
locally before deploying.

## 5. Deploy to Vercel

1. Push this folder to a GitHub repo (make sure `.env` is **not** committed —
   check `.gitignore` includes it, which it does by default here).
2. Vercel → **Add New → Project** → import the repo.
3. Framework preset: Vercel auto-detects **Vite**. Build command
   (`npm run build`) and output directory (`dist`) are filled in
   automatically — no changes needed.
4. **Before deploying**, go to the project's **Environment Variables**
   settings in Vercel and add:
   - `VITE_SUPABASE_URL` → your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` → your Supabase anon/public key

   (This replaces the local `.env` file — Vercel needs the values set in
   its own dashboard since `.env` isn't in your repo.)
5. Click **Deploy**.

## Bulk Import

Use this instead of adding records one at a time.

1. In the app sidebar, click **Bulk Import**.
2. Click **Download Template** — this pulls the same `MPEP_Bulk_Upload_Template.xlsx`
   file described above (it's bundled with the site at `public/MPEP_Bulk_Upload_Template.xlsx`).
3. Fill in whichever sheets you need (Employees, Evaluations, HR Attention,
   3rd & 5th Month) — delete the yellow EXAMPLE row or leave it, the import
   ignores it automatically.
4. Come back to **Bulk Import**, choose your filled-in file, click **Run Import**.
5. You'll get a per-sheet summary: how many rows were added, and a table of
   any skipped rows with the exact reason (e.g. "no employee with this name
   found", "invalid Evaluation Result value").

**How matching works:** Evaluations, HR Attention, and 3rd & 5th Month rows
are linked to an employee by exact name match (case-insensitive) against
the Employees sheet in the same file *and* employees already in the
database. Import the Employees sheet first (or in the same upload) before
Evaluations that reference brand-new employees.

## v4 changes (backup is now a designed Excel workbook)

**Backup & Restore now produces a formatted `.xlsx` workbook instead of a raw JSON dump.**
The old JSON file was fine for the computer and useless for a person — you couldn't open it,
read it, or hand it to anyone. The backup is now a real spreadsheet you can read in Excel and
still restore from.

### What the backup file looks like

- **`Backup Info` cover sheet** — brand header, generation timestamp, who generated it, a
  contents table with a live record count per sheet (a `COUNTA` formula, so the number stays
  correct if you delete rows before restoring), a grand total, numbered restore steps, and a
  warning block explaining the hidden ID columns.
- **One sheet per table** — Employees, Evaluations, HR Attention, 3rd & 5th Month, Sign-Off,
  Progress Highlights.
- **Each data sheet** has a navy title band with the sheet name, record count and source table;
  a bold header row with an amber underline, frozen along with the first column so the name
  stays visible while you scroll; autofilter on every column; banded rows; thin borders;
  real Excel date cells formatted `yyyy-mm-dd` (not text); `0.00` on KPI scores; wrapped text
  with auto-sized row heights on the long note columns; and **colour-coded result cells** using
  the same green / red / amber / blue as the badges in the app.
- **Employee names are resolved** into the Evaluations, HR Attention and 3rd & 5th Month sheets,
  so you're not reading a wall of UUIDs.
- **System columns (IDs, timestamps) are hidden** on the far right, in grey italic. They are
  what make a restore an *update* instead of a duplicate insert. Unhide them if you want,
  but don't edit them.

### What changed about Restore

- The file picker now accepts `.xlsx`. **Old `.json` backups still restore** — the code detects
  the format from the extension, so nothing you already downloaded becomes useless.
- The restore reads back from the sheets by matching header text, and it finds the header row
  rather than assuming a fixed position, so inserting a note row above a table won't break it.
- **A row with a blank ID is inserted as a new record** rather than rejected — so you can type
  new rows straight into the backup file and restore them. Existing IDs are updated. Nothing is
  ever deleted.
- Legacy tables (`sign_off`, `progress_highlights`) are treated as optional: if you've dropped
  them from your database, the backup notes it on the cover sheet and carries on instead of
  failing.

### Technical notes

- Added **`exceljs`** as a dependency. SheetJS (`xlsx`), which the app already used, cannot
  write cell styling in its community build — fills, fonts, borders and number formats are all
  paid-edition features. SheetJS stays in the project and still powers **Bulk Import**; ExcelJS
  is used only for the backup workbook.
- ExcelJS is ~1 MB, so it is **dynamically imported** inside `src/js/backupWorkbook.js` rather
  than at the top level. Vite splits it into its own chunk that only downloads the first time
  someone opens a backup — the main dashboard bundle is unchanged in size.
- New file **`src/js/backupWorkbook.js`** holds the workbook layout and the parser, with no DOM
  or Supabase imports. One `TABLE_SPECS` constant drives both writing and reading, so a renamed
  column can never desync the two halves. `src/js/pages/backupRestore.js` is now just the
  fetching, downloading and upserting.
- Dates are written as real Excel dates built at **UTC midnight** and read back with the UTC
  getters, so a round-trip is exact in any timezone. This is the same class of bug the v3
  Reporting Month fix dealt with.

**Upgrading an existing deployment:** run `npm install` (to pull `exceljs`), then replace your
project files with this delivery, keeping your `.env`. No SQL migration needed.

## v3 changes (critical timezone bug fix, Sign-Off removed)

**Critical fix — Reporting Month was silently wrong.** The month selector built its date
values using `Date.toISOString()`, which converts to UTC first. For timezones ahead of UTC
(Philippines is UTC+8), a local midnight timestamp rolls back to the previous day once
converted — so picking "August 2026" was actually storing `2026-07-31` under the hood. That
mismatch is why evaluations never seemed to line up with the selected month, and why
"This Month's Result" looked disconnected from what was actually logged. Every date built
in the app now uses local calendar components instead of UTC conversion, so the dropdown's
displayed month always matches what gets saved and queried.

**Sign-Off page removed** — nav item and page gone entirely, same as Progress Highlights
before it. The `sign_off` table still exists in your database (harmless, unused).

If you're upgrading an existing deployment: just replace your project files with this
delivery (keep your `.env`). No new SQL migration is needed for this update — v2's
`migration_v2.sql` still applies if you haven't run it yet.

## v2 changes (Employee-driven Probationary/Regular/3rd&5th, trimmed Dashboard)

If you're upgrading an existing deployment, do these two things:

**1. Run the migration SQL.** In Supabase → SQL Editor, run `supabase/migration_v2.sql`.
It adds a uniqueness constraint needed for the new auto-driven 3rd & 5th Month tracker.
It's safe to run even on a brand-new database.

**2. Replace your project files** with this delivery (overwrite everything except
`.env`, which already has your real keys and doesn't need to change).

### What changed
- **Probationary / Regular tabs** now list every matching employee from your Employees
  master list automatically — you no longer manually "add an evaluation row." Click
  **Manage Evaluations** on any employee to open their full evaluation history and add/edit
  any month's evaluation for them (useful for employees hired mid-year, e.g. hired in
  December — you can still log any month's evaluation, not just the currently selected one).
- **3rd & 5th Month tracker** now auto-lists every Probationary employee with their
  computed months-employed and due/overdue status — no manual "add employee" step.
  Click **Edit** to record a result once it's due.
- **Progress Highlights page removed** entirely (nav item + section gone). The
  `progress_highlights` table still exists in your database (harmless, unused) unless you
  drop it via the commented-out line in `migration_v2.sql`.
- **Dashboard** no longer shows the "Total Evaluated / On Track / Needs Improvement / Failed
  / PIP / Completed" KPI cards or the "Monthly Summary — by Category" table. It now shows:
  Total Workforce cards, Status Breakdown chart, Probationary vs Regular chart, Monthly
  Evaluation Trend chart, and a new **Regular Employees — Monthly Headcount Trend** chart.
- **Tables**: the first column now stays visible while scrolling horizontally (sticky),
  long text truncates with a hover tooltip instead of forcing a wide scroll, and clicking
  any row highlights it (amber) so you can visually confirm which record you're about to
  edit before clicking Edit/Delete.

### Files to delete / ignore
- Nothing needs to be deleted from your Supabase database — the migration only adds a
  constraint.
- If your local project folder has a stray `jay lang.zip` file at the root (not part of
  this app), it's safe to delete — it isn't referenced anywhere in the code.

## Database setup

Same as before — this hasn't changed. If you haven't already, run
`supabase/schema.sql` once in your Supabase project's SQL Editor to create
the tables, views, and Row Level Security policies. See the earlier setup
guide for creating HR user logins in Authentication → Users.

## Project structure

```
mpep/
├── index.html              ← login page (Vite root page)
├── dashboard.html            ← main app shell, all tabs live in one page
├── package.json
├── vite.config.js
├── .env                       ← your real Supabase keys (git-ignored)
├── .env.example                ← template for others
├── src/
│   ├── css/style.css
│   └── js/
│       ├── supabaseClient.js   ← reads keys from import.meta.env
│       ├── login.js              ← login page logic
│       ├── app.js                 ← main entry point — auth guard + wires everything together
│       ├── store.js                ← shared app state (current user, selected month, employee cache)
│       ├── utils.js                 ← date formatting, escaping, toast, small form helpers
│       ├── ui.js                     ← generic modal + row-selection highlight chrome
│       ├── nav.js                     ← sidebar navigation, view dispatch, month selector
│       ├── crud.js                     ← shared "Delete" handler used by every page
│       ├── bulkImport.js                ← Bulk Import file-parsing logic (xlsx → Supabase rows)
│       ├── backupWorkbook.js             ← styled Excel backup: layout + parser (no DOM/Supabase)
│       └── pages/
│           ├── employees.js               ← Employees page
│           ├── evaluations.js              ← Probationary/Regular pages + evaluation history modal
│           ├── hrAttention.js               ← HR Attention page
│           ├── thirdFifth.js                 ← 3rd & 5th Month tracker page
│           ├── dashboard.js                   ← Dashboard KPIs + charts
│           ├── bulkImportUI.js                 ← Bulk Import page (button wiring, results display)
│           └── backupRestore.js                 ← Backup & Restore page (fetch, download, upsert)
└── supabase/
    ├── schema.sql                 ← run once for a fresh database
    ├── migration_v2.sql             ← employee-driven pages migration
    └── fix_reporting_month_dates.sql  ← one-time repair for pre-timezone-fix data
```

### Why it's split this way
Each file in `src/js/pages/` owns exactly one sidebar tab — its data loading, rendering, and
Add/Edit/Delete logic all live together, so if you need to change how HR Attention works, you
only ever need to open `pages/hrAttention.js`. Shared pieces (state, generic modal, date
formatting, delete handling) live in the top-level `src/js/` files so no page duplicates them.
The site itself didn't change — it's still one fast-loading page with instant tab switching,
this is purely a source-code organization change.

