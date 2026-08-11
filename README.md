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

## Database setup

Same as before — this hasn't changed. If you haven't already, run
`supabase/schema.sql` once in your Supabase project's SQL Editor to create
the tables, views, and Row Level Security policies. See the earlier setup
guide for creating HR user logins in Authentication → Users.

## Project structure

```
mpep/
├── index.html              ← dashboard entry (Vite root page)
├── login.html                ← sign-in entry
├── package.json
├── vite.config.js
├── .env                       ← your real Supabase keys (git-ignored)
├── .env.example                ← template for others
├── src/
│   ├── css/style.css
│   └── js/
│       ├── supabaseClient.js   ← reads keys from import.meta.env
│       ├── login.js              ← sign-in page logic
│       └── app.js                 ← all dashboard logic (CRUD, charts)
└── supabase/schema.sql        ← run once in Supabase SQL Editor
```
