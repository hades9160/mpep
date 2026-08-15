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
│       └── pages/
│           ├── employees.js               ← Employees page
│           ├── evaluations.js              ← Probationary/Regular pages + evaluation history modal
│           ├── hrAttention.js               ← HR Attention page
│           ├── thirdFifth.js                 ← 3rd & 5th Month tracker page
│           ├── dashboard.js                   ← Dashboard KPIs + charts
│           └── bulkImportUI.js                 ← Bulk Import page (button wiring, results display)
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

