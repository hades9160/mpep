# Aurion Solar — Monthly Performance Evaluation Dashboard

A working replacement for the `Monthly_Performance_Evaluation_Progress_Report.xlsx`
workbook: same sections (Monthly Summary, Probationary/Regular Employee
Evaluation, HR Attention, Progress Highlights, 3rd & 5th Month Tracker,
Sign-Off), now a real multi-user website backed by Supabase, deployable to
Vercel for free.

Stack: plain HTML/CSS/JS (no build step, no framework) + Supabase (Postgres +
Auth) + Chart.js (CDN) + Vercel (static hosting).

## Folder structure

```
aurion-perf-dashboard/
├── index.html          ← main app (dashboard + all sections)
├── login.html           ← sign-in page
├── vercel.json
├── css/style.css
├── js/
│   ├── supabaseClient.js   ← YOU edit this with your project keys
│   └── app.js               ← all app logic
└── supabase/schema.sql    ← run this once in Supabase
```

## 1. Create the Supabase project

1. Go to https://supabase.com → New project. Pick any name/region, save the
   database password somewhere safe.
2. Once it's created, open **SQL Editor → New query**, paste the entire
   contents of `supabase/schema.sql`, and click **Run**. This creates all 6
   tables (`employees`, `evaluations`, `hr_attention`, `progress_highlights`,
   `third_fifth_month`, `sign_off`), two summary views, and Row Level
   Security policies that only let *logged-in* users read/write data.
3. Go to **Authentication → Providers** and confirm **Email** is enabled.
4. Go to **Authentication → Settings** and turn **off** "Allow new users to
   sign up" if you only want HR staff you personally create to have access
   (recommended for an internal tool).
5. Go to **Authentication → Users → Add user** and create a login for
   yourself (and each HR staff member), e.g. `cath@aurionsolar.com` with a
   password. There is no public sign-up page in this app — accounts are
   admin-created only.

## 2. Connect the frontend to your project

1. In Supabase: **Project Settings → API**. Copy the **Project URL** and the
   **anon public** key.
2. Open `js/supabaseClient.js` and replace:
   ```js
   const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
   const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
   ```
   with your real values. (The anon key is safe to expose in frontend code —
   it only grants what your Row Level Security policies allow, which here is
   "must be logged in.")

## 3. Test locally (optional but recommended)

You can't just double-click `index.html` because browsers block some
features on `file://`. Serve it locally instead:

```bash
cd aurion-perf-dashboard
python3 -m http.server 8000
# then open http://localhost:8000/login.html
```

Log in with the account you created in step 1.5. Add an employee, log an
evaluation, and confirm the Dashboard charts update.

## 4. Deploy to Vercel

**Option A — Vercel dashboard (no CLI needed)**
1. Push this `aurion-perf-dashboard` folder to a GitHub repo.
2. Go to https://vercel.com → **Add New → Project** → import that repo.
3. Framework preset: **Other** (it's static HTML — no build command, no
   output directory needed).
4. Click **Deploy**. Done — you'll get a URL like
   `https://aurion-perf-dashboard.vercel.app`.

**Option B — Vercel CLI**
```bash
npm install -g vercel
cd aurion-perf-dashboard
vercel login
vercel --prod
```

Either way, since `js/supabaseClient.js` already has your project keys baked
in before deploying, no environment variables are required.

## 5. Day-to-day use

- **Employees** tab: add every employee once (name, position, department,
  date hired, Probationary/Regular). This master list feeds the dropdowns
  everywhere else.
- **Reporting Month** selector (top-right): every evaluation, HR-attention
  record, highlight, and sign-off is scoped to the month you pick here —
  mirrors "Reporting Month" on the original sheet.
- **Probationary / Regular** tabs: log each employee's monthly evaluation
  result — this is what drives the Dashboard charts and KPI cards.
- **HR Attention**, **3rd & 5th Month**, **Progress Highlights**, **Sign-Off**:
  direct equivalents of those sheets.
- **Dashboard**: status breakdown, Probationary vs Regular split, and a
  6-month trend line — auto-computed from the evaluations you've logged, no
  manual chart updating needed (unlike the Excel version).

## Notes / next steps you may want

- Right now every logged-in user has full read/write access to everything —
  fine for a small HR team. If you later want read-only roles or
  department-scoped access, that's a Row Level Security policy change in
  `supabase/schema.sql`.
- CSV/PDF export isn't wired up yet; the cleanest place to add it is a
  "Export" button on each table view using Supabase's `select()` results.
- To add a company logo, drop an image into the project and reference it in
  the `.sidebar-brand .mark` / `.login-brand .mark` divs in place of the
  "AS" text mark.
